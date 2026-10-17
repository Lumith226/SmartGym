"""Exercise the real app/model path with a mocked window and camera source.

Run from smart_gym_camera_app. Uses existing local weights and benchmark
videos; does not open the physical camera or require a desktop display.
"""

import argparse
import json
from pathlib import Path
import sys
from unittest.mock import patch

import cv2
import numpy as np
import torch

import app
from onnx_gym_analyzer import ONNXGymAnalyzer
from pose_backends.factory import ROOT, BACKENDS
from pose_tracking import PoseStream
from session_logger import SessionLogger


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pose-backend", choices=BACKENDS, default="yolo-detect-rtmpose")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(2)
    cv2.setNumThreads(2)
    squat = ROOT / "test_videos_benchmark/squats/BACK_ROUNDING_00001672.mp4"
    push = ROOT / "test_videos_benchmark/pushups/HIP_ALIGNMENT_00135411.mp4"
    real_capture, real_update, real_reset = cv2.VideoCapture, PoseStream.update, PoseStream.reset
    real_predict, real_build = ONNXGymAnalyzer.predict_rep_tensor, app.build_pose_backend
    counts = {"displayed": 0, "updates": 0, "ready_frames": 0, "resets": 0,
              "classifier_calls": 0, "camera_mocked": True, "native_gui_mocked": True,
              "backend": args.pose_backend, "events": []}
    callbacks = {}

    def build(config):
        backend = real_build(config)
        counts["canonical_backend"] = config.canonical_backend
        counts["detector_task"] = backend.model.task
        return backend

    def capture(source):
        return real_capture(str(push) if isinstance(source, int) else source)

    def update(self, candidates, timestamp, width, height):
        packet = real_update(self, candidates, timestamp, width, height)
        counts["updates"] += 1
        counts["ready_frames"] += int(packet.ready)
        assert np.isfinite(packet.display).all()
        assert not packet.raw[:, packet.inferred].any()
        return packet

    def reset(self, exercise=None):
        counts["resets"] += 1
        return real_reset(self, exercise)

    def predict(self, *args, **kwargs):
        counts["classifier_calls"] += 1
        return real_predict(self, *args, **kwargs)

    def show(name, frame):
        counts["displayed"] += 1
        if counts["displayed"] in [72, 142, 312]:
            cv2.imwrite(str(args.output / f"frame_{counts['displayed']:04d}.jpg"), frame)

    def key(delay):
        n = counts["displayed"]
        schedule = {160: "r", 170: "p", 171: "p", 190: "r", 210: "v", 235: "2",
                    250: "c", 270: "v", 290: "1", 420: "q"}
        if n == 220:
            callbacks["mouse"](cv2.EVENT_LBUTTONDOWN, 320, 240, 0, None)
            counts["events"].append("click")
        if n in schedule:
            counts["events"].append(schedule[n])
            return ord(schedule[n])
        return 255

    with patch.object(sys, "argv", ["app.py", "--video", str(squat), "--pose-backend", args.pose_backend]), \
         patch.object(app, "SOUND_ENABLED", False), \
         patch.object(app, "SessionLogger", lambda: SessionLogger(str(args.output / "logs"))), \
         patch.object(app, "pick_video_file", lambda: str(push)), \
         patch.object(app, "build_pose_backend", build), \
         patch.object(PoseStream, "update", update), patch.object(PoseStream, "reset", reset), \
         patch.object(ONNXGymAnalyzer, "predict_rep_tensor", predict), \
         patch.object(cv2, "VideoCapture", capture), \
         patch.object(cv2, "namedWindow"), patch.object(cv2, "resizeWindow"), \
         patch.object(cv2, "setMouseCallback", lambda name, callback: callbacks.update(mouse=callback)), \
         patch.object(cv2, "imshow", show), patch.object(cv2, "waitKey", key), \
         patch.object(cv2, "destroyAllWindows"):
        app.main()
    assert counts["displayed"] == 420 and counts["updates"] > 350, counts
    assert counts["ready_frames"] > 0 and counts["resets"] >= 7, counts
    assert counts["classifier_calls"] > 0, counts
    assert counts["events"].count("p") == 2 and "click" in counts["events"], counts
    if counts["canonical_backend"] == "yolo-detect-rtmpose":
        assert counts["detector_task"] == "detect", counts
    metadata_files=list((args.output / "logs").glob("session_*/pose_backend.json"))
    assert metadata_files, "Missing session pose configuration"
    metadata=json.loads(max(metadata_files, key=lambda p:p.stat().st_mtime).read_text())
    assert metadata["backend"] == counts["canonical_backend"]
    counts["session_metadata_saved"] = True
    (args.output / "result.json").write_text(json.dumps(counts, indent=2) + "\n")
    print(json.dumps(counts), flush=True)


if __name__ == "__main__":
    main()
