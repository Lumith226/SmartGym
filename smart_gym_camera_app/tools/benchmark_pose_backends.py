"""Compare actual full pipelines on identical video frames, sequentially on CPU.

Availability is not accuracy. No classifier is run. The saved candidate and
selected keypoints support later annotation-based evaluation. Rendered video
plays at source FPS and does not represent inference FPS.
"""

import argparse
from collections import Counter
from dataclasses import asdict, replace
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform
import time

import cv2
import numpy as np

from diagnose_pose import DEFAULT_VIDEOS, EXERCISES, draw_pose
from pose_backends.factory import ROOT, add_pose_arguments, config_from_args, build_pose_backend, describe_backend
from pose_tracking import PoseStream


def timing_summary(values):
    return {"median_ms": float(np.median(values)), "p95_ms": float(np.percentile(values, 95))} if values else None


def benchmark_video(video, backends, configs, output, max_frames, render=False, exercise=None):
    exercise = exercise or EXERCISES.get(video.parent.name)
    if exercise is None:
        raise ValueError(f"Unknown exercise folder for {video}; pass --exercise")
    capture = cv2.VideoCapture(str(video))
    if not capture.isOpened():
        raise RuntimeError(f"Cannot open video: {video}")
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    if not np.isfinite(fps) or fps <= 0:
        capture.release()
        raise ValueError("A valid source FPS is required for comparable temporal filtering")
    streams = {name: PoseStream(exercise, confidence_threshold=configs[name].confidence_threshold)
               for name in backends}
    for detector in backends.values():
        detector.reset()
    stats = {name: Counter() for name in backends}
    elapsed, selected, observed, ids, ready, states = ({name: [] for name in backends} for _ in range(6))
    offsets = {name: [0] for name in backends}
    boxes, candidates, box_scores = ({name: [] for name in backends} for _ in range(3))
    empty_run = {name: 0 for name in backends}
    stem = video.parent.name + "__" + video.stem
    writer = None
    count = 0
    names = list(backends)
    try:
        while count < max_frames:
            ok, frame = capture.read()
            if not ok:
                break
            height, width = frame.shape[:2]
            packets = {}
            # Rotate execution order to reduce systematic first/last-backend bias.
            for name in names[count % len(names):] + names[:count % len(names)]:
                detection = backends[name].detect(frame, count / fps, streams[name])
                packet = streams[name].update(detection.candidates, count / fps, width, height)
                if not np.isfinite(packet.raw).all() or packet.raw[:, packet.inferred].any():
                    raise RuntimeError(f"Invalid/inferred raw observation from {name}")
                packets[name] = packet
                elapsed[name].append(detection.latency_ms)
                selected[name].append(packet.raw)
                observed[name].append(packet.observed)
                ids[name].append(packet.selection.track_id or -1)
                ready[name].append(packet.ready)
                states[name].append(packet.selection.state)
                # Save actual full-frame candidates; ROI choice is in selected/raw.
                boxes[name].extend(c.box for c in detection.full_candidates)
                candidates[name].extend(c.keypoints for c in detection.full_candidates)
                box_scores[name].extend(c.confidence for c in detection.full_candidates)
                offsets[name].append(len(boxes[name]))
                stat = stats[name]
                stat["frames"] += 1
                missing = not detection.full_candidates
                stat["no_fullframe_person_frames"] += missing
                empty_run[name] = empty_run[name] + 1 if missing else 0
                stat["longest_no_person_run"] = max(stat["longest_no_person_run"], empty_run[name])
                stat["fullframe_candidates"] += len(detection.full_candidates)
                stat["ready_frames"] += bool(packet.ready)
                stat["no_target_frames"] += packet.selection.candidate is None
                stat["ambiguous_frames"] += packet.selection.state == "AMBIGUOUS"
                stat["reselect_required_frames"] += packet.selection.state == "RESELECT_REQUIRED"
                stat["history_resets"] += packet.reset_history
                stat["observed_joint_frames"] += int(packet.observed.sum())
                stat["recovery_attempts"] += detection.recovery_attempted
                stat["recoveries"] += detection.recovered
            if render:
                panels = []
                for index, name in enumerate(names):
                    p = packets[name]
                    drawing = p.raw.copy()
                    drawing[:, ~p.observed] = 0
                    panels.append(draw_pose(frame, drawing, f"{name} | {p.selection.state} | ready={p.ready}",
                                            [(90, 240, 100), (240, 130, 240), (240, 200, 80)][index % 3]))
                canvas = np.concatenate(panels, axis=1)
                if writer is None:
                    writer = cv2.VideoWriter(str(output / (stem + ".mp4")),
                        cv2.VideoWriter_fourcc(*"mp4v"), fps, (canvas.shape[1], canvas.shape[0]))
                    if not writer.isOpened():
                        raise RuntimeError("Cannot create comparison video")
                writer.write(canvas)
                if count == 105:
                    cv2.imwrite(str(output / (stem + ".jpg")), canvas)
            count += 1
    finally:
        capture.release()
        if writer is not None:
            writer.release()
    if not count:
        raise ValueError(f"No decoded frames: {video}")
    data = {"fps": fps}
    for name in names:
        for suffix, values in [("selected", selected), ("observed", observed), ("track_id", ids),
                               ("ready", ready), ("state", states), ("frame_offsets", offsets)]:
            data[name + "_" + suffix] = np.asarray(values[name])
        data[name + "_boxes"] = np.asarray(boxes[name], np.float32).reshape(-1, 4)
        data[name + "_box_scores"] = np.asarray(box_scores[name], np.float32)
        data[name + "_candidates"] = np.asarray(candidates[name], np.float32).reshape(-1, 3, 17)
        data[name + "_latency_ms"] = np.asarray(elapsed[name])
    np.savez_compressed(output / (stem + ".npz"), **data)
    return {"video": video.name, "folder": video.parent.name, "exercise": exercise,
            "source_sha256": hashlib.sha256(video.read_bytes()).hexdigest(),
            "frames": count, "source_fps": fps, "archive": stem + ".npz",
            "arms": {name: {**dict(stats[name]), "inference_latency": timing_summary(elapsed[name])}
                     for name in names}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_pose_arguments(parser)
    parser.add_argument("--video", action="append", type=Path)
    parser.add_argument("--exercise", help="Required for videos outside known benchmark exercise folders")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--max-frames", type=int, default=180)
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--backends", nargs="+", choices=["yolo", "yolo-pose-rtmpose", "yolo-detect-rtmpose"],
                        default=["yolo", "yolo-pose-rtmpose", "yolo-detect-rtmpose"])
    args = parser.parse_args()
    if args.max_frames < 1:
        parser.error("--max-frames must be positive")
    # Per-arm default joint thresholds must remain distinct.
    if args.pose_min_score is not None:
        parser.error("This comparison uses fixed per-backend joint thresholds (.5/.3)")
    template = config_from_args(args)
    names = args.backends
    if len(set(names)) != len(names):
        parser.error("Duplicate backend names are not allowed")
    configs = {n: replace(template, backend=n) for n in names}
    for config in configs.values():
        config.validate()
    backends = {n: build_pose_backend(c) for n, c in configs.items()}
    cv2.setNumThreads(args.pose_threads)
    dummy = np.zeros((480, 640, 3), np.uint8)
    for backend in backends.values():
        for _ in range(3):
            backend._infer(dummy)
            if hasattr(backend, "estimator"):
                backend.estimator.estimate(dummy, [[100, 20, 450, 470]])
    videos = args.video or [ROOT / "test_videos_benchmark" / v for v in DEFAULT_VIDEOS]
    args.output.mkdir(parents=True, exist_ok=True)
    report = {"schema_version": 1, "scope": "Availability/operational comparison; not joint accuracy or downstream form accuracy.",
              "timing_scope": "Warmed sequential CPU detection + pose + optional ROI retry; excludes decoding, tracking, classifier, rendering and GUI. Rotating arm order; not application FPS.",
              "media_scope": "Post-rendered at source FPS; observed raw joints only.",
              "environment": {"platform": platform.platform(), "python": platform.python_version(),
                  **{n: version(n) for n in ["numpy", "opencv-python", "torch", "ultralytics", "onnxruntime"]}},
              "configs": {n: {k: str(v) if isinstance(v, Path) else v for k, v in asdict(c).items()} for n, c in configs.items()},
              "backend_assets": {n: describe_backend(c) for n, c in configs.items()},
              "videos": [], "failures": []}
    for video in videos:
        try:
            row = benchmark_video(video, backends, configs, args.output, args.max_frames, args.render, args.exercise)
            report["videos"].append(row)
            print(f"{video.parent.name}/{video.name}: {row['frames']} frames", flush=True)
        except Exception as exc:
            report["failures"].append({"video": str(video), "error": str(exc)})
        (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    if report["failures"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
