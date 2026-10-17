"""Run every benchmark video, sharing full-frame YOLO across comparison arms.

Reports observation availability and processing continuity, never accuracy.
An optional previous pose_tracking.py provides a reproducible before/after arm.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.util
from importlib.metadata import version
import json
import platform
from pathlib import Path
import sys
import time

import cv2
import numpy as np
import torch
from ultralytics import YOLO

from diagnose_pose import EXERCISES, ROOT
from pose_detector import PoseDetector
from pose_tracking import PoseStream


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_previous(path):
    spec = importlib.util.spec_from_file_location("previous_pose_tracking", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def audit_video(model, video, args, previous):
    exercise = EXERCISES[video.parent.name]
    streams = {"full_frame": PoseStream(exercise), "with_recovery": PoseStream(exercise)}
    if previous:
        streams["previous"] = previous.PoseStream(exercise)
    stats = {name: Counter() for name in streams}
    ids = {name: set() for name in streams}
    detector = PoseDetector(model, image_size=args.imgsz, cpu_threads=args.threads)
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open {video}")
    fps = float(cap.get(cv2.CAP_PROP_FPS))
    if not np.isfinite(fps) or fps <= 0:
        raise RuntimeError(f"Invalid source FPS: {video}")
    source_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_index = 0
    latency = []
    retry_count = accepted_count = 0
    offsets, all_candidates, sizes = [0], [], []
    started = time.perf_counter()
    try:
        while not args.max_frames or frame_index < args.max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            height, width = frame.shape[:2]
            timestamp = frame_index / fps
            detection = detector.detect(frame, timestamp, streams["with_recovery"])
            all_candidates.extend(detection.full_candidates)
            offsets.append(len(all_candidates))
            sizes.append((width, height))
            retry_count += detection.recovery_attempted
            accepted_count += detection.recovered
            latency.append(detection.latency_ms)
            for name, stream in streams.items():
                candidates = detection.candidates if name == "with_recovery" else detection.full_candidates
                packet = stream.update(candidates, timestamp, width, height)
                count = stats[name]
                count["frames"] += 1
                count["ready_frames"] += bool(packet.ready)
                count["no_target_frames"] += packet.selection.candidate is None
                count["ambiguous_frames"] += packet.selection.state == "AMBIGUOUS"
                count["reselect_required_frames"] += packet.selection.state == "RESELECT_REQUIRED"
                count["history_resets"] += packet.reset_history
                count["observed_joint_frames"] += int(packet.observed.sum())
                count["inferred_joint_frames"] += int(packet.inferred.sum())
                if packet.selection.track_id:
                    ids[name].add(packet.selection.track_id)
                if not np.isfinite(packet.display).all() or not np.isfinite(packet.raw).all():
                    raise RuntimeError("Nonfinite keypoints")
                if packet.raw[:, packet.inferred].any():
                    raise RuntimeError("Inferred points leaked into model input")
                if packet.ready and packet.selection.candidate is None:
                    raise RuntimeError("Missing person qualified for evaluation")
            frame_index += 1
    finally:
        cap.release()
    if frame_index == 0 or (not args.max_frames and frame_index != source_frames):
        raise RuntimeError(f"Decoded {frame_index}/{source_frames} frames: {video}")
    cache_dir = args.output / "full_detections"
    cache_dir.mkdir(exist_ok=True)
    cache = cache_dir / f"{video.parent.name}__{video.stem}.npz"
    np.savez_compressed(cache, frame_offsets=np.asarray(offsets), frame_sizes=np.asarray(sizes), fps=fps,
                        boxes=np.asarray([c.box for c in all_candidates], dtype=np.float32).reshape(-1, 4),
                        keypoints=np.asarray([c.keypoints for c in all_candidates], dtype=np.float32).reshape(-1, 3, 17),
                        confidence=np.asarray([c.confidence for c in all_candidates], dtype=np.float32),
                        detection_index=np.asarray([c.index for c in all_candidates], dtype=np.int32))
    return {"video": str(video), "exercise": exercise, "source_frames": source_frames,
            "source_fps": fps, "frames_processed": frame_index,
            "recovery_attempts": retry_count, "recovery_accepted_frames": accepted_count,
            "detector_latency_median_ms": round(float(np.median(latency)), 2),
            "detector_latency_p95_ms": round(float(np.percentile(latency, 95)), 2),
            "wall_time_s": round(time.perf_counter() - started, 2), "full_detections_cache": str(cache),
            "arms": {name: dict(count, track_ids_acquired=len(ids[name])) for name, count in stats.items()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--previous-tracking", type=Path)
    parser.add_argument("--video", action="append", type=Path)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--max-frames", type=int, default=0, help="0 = entire source")
    args = parser.parse_args()
    if args.threads < 1 or args.max_frames < 0:
        parser.error("threads must be positive and max-frames nonnegative")
    torch.set_num_threads(args.threads)
    cv2.setNumThreads(args.threads)
    args.output.mkdir(parents=True, exist_ok=True)
    previous = load_previous(args.previous_tracking) if args.previous_tracking else None
    videos = args.video or sorted((ROOT / "test_videos_benchmark").glob("*/*.mp4"))
    if not videos:
        parser.error("No input videos")
    model = YOLO(str(ROOT / "weights/yolov8n-pose.pt"))
    report = {"warning": "Availability/continuity only; no keypoint or identity ground truth. Not accuracy.",
              "run_started_utc": datetime.now(timezone.utc).isoformat(),
              "python": platform.python_version(), "platform": platform.platform(),
              "packages": {name: version(name) for name in ("ultralytics", "torch", "opencv-python", "numpy")},
              "full_frame_inference_shared": True, "imgsz": args.imgsz, "threads": args.threads,
              "max_frames": args.max_frames, "expected_videos": len(videos), "videos": [], "failures": [],
              "weights_sha256": digest(ROOT / "weights/yolov8n-pose.pt"),
              "tracking_sha256": digest(ROOT / "pose_tracking.py"),
              "detector_sha256": digest(ROOT / "pose_detector.py"),
              "previous_tracking_sha256": digest(args.previous_tracking) if previous else None}
    for i, video in enumerate(videos, 1):
        print(f"RUN {i}/{len(videos)} {video.parent.name}/{video.name}", flush=True)
        try:
            result = audit_video(model, video.resolve(), args, previous)
            report["videos"].append(result)
            print(json.dumps(result), flush=True)
        except Exception as exc:
            report["failures"].append({"video": str(video), "error": str(exc)})
            print(f"FAILED {exc}", flush=True)
        totals = {}
        for result in report["videos"]:
            for name, values in result["arms"].items():
                totals.setdefault(name, Counter()).update(values)
        report["totals"] = {name: dict(values) for name, values in totals.items()}
        report["complete"] = len(report["videos"]) + len(report["failures"]) == len(videos)
        (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"REPORT {args.output / 'report.json'}", flush=True)
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
