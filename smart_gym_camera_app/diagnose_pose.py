"""Compare original YOLO keypoints with the application's existing pose filter.

This measures filter displacement and missing observations, not pose accuracy.
Manual keypoint annotations are required to determine which coordinates are right.
"""

import argparse
import csv
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform
import time

import cv2
import numpy as np
import torch
from ultralytics import YOLO

from enhanced_pose_processor import EnhancedPoseProcessor
from pose_tracking import PoseStream, extract_candidates, visible_joints
from pose_detector import PoseDetector


ROOT = Path(__file__).resolve().parent
JOINTS = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]
EDGES = [(5, 6), (5, 7), (7, 9), (6, 8), (8, 10), (5, 11),
         (6, 12), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16)]
EXERCISES = {"squats": "squat", "pushups": "pushup",
             "jumping_jacks": "jump_jack", "reverse_crunches": "crunch"}
DEFAULT_VIDEOS = [
    "squats/CORRECT_00002456.mp4",
    "squats/BACK_ROUNDING_00001672.mp4",
    "pushups/HIP_ALIGNMENT_00135411.mp4",
    "jumping_jacks/CORRECT_00003013.mp4",
    "reverse_crunches/CORRECT_00085688.mp4",
]


def draw_pose(frame, pose, title, color, inferred=None):
    """Draw only observable joints, with index and confidence for inspection."""
    canvas = frame.copy()
    height, width = frame.shape[:2]
    points = pose[:2].T * np.array([width, height])
    inferred = np.zeros(17, dtype=bool) if inferred is None else inferred
    valid = visible_joints(pose, 0.25) | inferred
    for a, b in EDGES:
        if valid[a] and valid[b]:
            cv2.line(canvas, tuple(points[a].astype(int)),
                     tuple(points[b].astype(int)),
                     (145, 145, 145) if inferred[a] or inferred[b] else color, 2, cv2.LINE_AA)
    for j in np.flatnonzero(valid):
        point = tuple(points[j].astype(int))
        joint_color = (145, 145, 145) if inferred[j] else color
        cv2.circle(canvas, point, 4, joint_color, 1 if inferred[j] else -1, cv2.LINE_AA)
        label = f"{j}:inferred" if inferred[j] else f"{j}:{pose[2, j]:.2f}"
        cv2.putText(canvas, label, (point[0] + 4, point[1] - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, joint_color, 1, cv2.LINE_AA)
    cv2.rectangle(canvas, (0, 0), (width, 28), (15, 15, 15), -1)
    cv2.putText(canvas, title, (8, 19), cv2.FONT_HERSHEY_SIMPLEX,
                0.43, color, 1, cv2.LINE_AA)
    return canvas


def compare_video(model, video, out_dir, max_frames, image_size, exercise=None, mode="stable", recovery=True, threads=2):
    exercise = exercise or EXERCISES.get(video.parent.name)
    if exercise is None:
        raise ValueError(f"Cannot infer exercise for {video}; supply --exercise")
    processor = EnhancedPoseProcessor(exercise)
    stream = PoseStream(exercise)
    detector = PoseDetector(model, image_size=image_size, recovery=recovery, cpu_threads=threads)
    destination = out_dir / f"{video.parent.name}__{video.stem}"
    destination.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video}")
    fps = float(cap.get(cv2.CAP_PROP_FPS))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = None
    raw_frames, filtered_frames, people, scores, frame_times, latencies = [], [], [], [], [], []
    api_frames, observed_frames, inferred_frames, readiness, identities, states = [], [], [], [], [], []
    selected_indices, resets = [], []
    recovery_attempts, recoveries, selected_sources = [], [], []
    candidates = []
    width = height = 0
    started = time.perf_counter()
    try:
        while len(raw_frames) < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            height, width = frame.shape[:2]
            tick = time.perf_counter()
            timestamp = len(raw_frames) / fps if fps > 0 else time.perf_counter() - started
            if mode == "stable":
                detection = detector.detect(frame, timestamp, stream)
                full_candidates = detection.full_candidates
                recovery_attempts.append(detection.recovery_attempted)
                recoveries.append(detection.recovered)
            else:
                result = model(frame, verbose=False, device="cpu", imgsz=image_size)[0]
                full_candidates = extract_candidates(result, width, height)
                recovery_attempts.append(False)
                recoveries.append(False)
            latencies.append((time.perf_counter() - tick) * 1000)
            count = len(full_candidates)
            raw = np.zeros((3, 17), dtype=np.float32)
            if count:
                raw = full_candidates[0].keypoints.copy()
                filtered = processor.process_frame(raw.copy()) if mode == "legacy" else raw.copy()
            else:
                count = 0
                # Match app.py: the processor is not called if there is no person.
                filtered = raw.copy()
            api_raw = raw.copy()
            if mode == "stable":
                packet = stream.update(detection.candidates, timestamp, width, height)
                raw, filtered = packet.raw, packet.display
                observed_now, inferred_now = packet.observed, packet.inferred
                readiness.append(packet.ready)
                identities.append(packet.selection.track_id or -1)
                selected_indices.append(packet.selection.candidate.index if packet.selection.candidate else -1)
                states.append(packet.selection.state)
                resets.append(packet.reset_history)
                selected_sources.append(packet.selection.candidate.source if packet.selection.candidate else "none")
            else:
                observed_now = visible_joints(raw, 0.25)
                inferred_now = (~observed_now) & (filtered[2] >= 0.2)
                readiness.append(False)
                identities.append(-1)
                selected_indices.append(0 if count else -1)
                states.append("LEGACY")
                resets.append(False)
                selected_sources.append("full" if count else "none")
            api_frames.append(api_raw)
            observed_frames.append(observed_now)
            inferred_frames.append(inferred_now)
            people.append(count)
            raw_frames.append(raw.copy())
            filtered_frames.append(filtered.copy())
            frame_times.append(cap.get(cv2.CAP_PROP_POS_MSEC))
            observed = raw[2] >= 0.25
            distance = np.linalg.norm((filtered[:2] - raw[:2]).T * [width, height], axis=1)
            score = float(distance[observed].max()) if observed.any() else 0.0
            scores.append(score)
            index = len(raw_frames) - 1
            left = draw_pose(frame, api_raw, "FIRST DETECTION", (70, 240, 90))
            right_title = (f"{mode.upper()} | {states[-1]} | {selected_sources[-1]} | "
                           f"ready={readiness[-1]} | gray=inferred")
            right = draw_pose(frame, filtered, right_title, (230, 130, 250), inferred_now)
            comparison = np.concatenate([left, right], axis=1)
            if writer is None:
                writer = cv2.VideoWriter(str(destination / "comparison.mp4"),
                                         cv2.VideoWriter_fourcc(*"mp4v"),
                                         fps if fps > 0 else 30, (width * 2, height))
                if not writer.isOpened():
                    raise RuntimeError("MP4 video writer could not be opened")
            writer.write(comparison)
            # Keep a few high-displacement examples spaced apart in source time.
            if score > 0:
                candidates.append((score, index, comparison.copy(), frame.copy()))
                candidates.sort(key=lambda item: item[0], reverse=True)
                selected = []
                for candidate in candidates:
                    if all(abs(candidate[1] - prior[1]) >= max(1, round(fps * 0.4))
                           for prior in selected):
                        selected.append(candidate)
                    if len(selected) == 3:
                        break
                candidates = selected
    finally:
        cap.release()
        if writer is not None:
            writer.release()
    if not raw_frames:
        raise RuntimeError(f"No decoded frames in {video}")
    raw = np.stack(raw_frames)
    filtered = np.stack(filtered_frames)
    observed = raw[:, 2] >= 0.25
    displacement = np.linalg.norm((filtered[:, :2] - raw[:, :2]).transpose(0, 2, 1)
                                  * [width, height], axis=2)
    per_joint = []
    for j, name in enumerate(JOINTS):
        valid = observed[:, j]
        changes = displacement[valid, j]
        per_joint.append({
            "joint": name,
            "raw_below_conf_025_pct": round(float((~valid).mean() * 100), 2),
            "confidence_qualified_filter_shift_mean_px": round(float(changes.mean()), 3) if len(changes) else None,
            "confidence_qualified_filter_shift_p95_px": round(float(np.percentile(changes, 95)), 3) if len(changes) else None,
            "confidence_qualified_filter_shift_max_px": round(float(changes.max()), 3) if len(changes) else None,
            "low_conf_input_with_filter_output_frames": int(((~valid) & (filtered[:, 2, j] >= 0.20)).sum()),
        })
    review_rows = []
    for rank, (score, index, picture, source_frame) in enumerate(candidates, 1):
        cv2.imwrite(str(destination / f"sample_{rank}_frame_{index:04d}.jpg"), picture)
        source_image = f"source_frame_{index:04d}.jpg"
        cv2.imwrite(str(destination / source_image), source_frame)
        for j, name in enumerate(JOINTS):
            review_rows.append({
                "source_image": source_image, "frame_index": index, "joint": name,
                "raw_x_px": round(float(raw[index, 0, j] * width), 2),
                "raw_y_px": round(float(raw[index, 1, j] * height), 2),
                "raw_conf": round(float(raw[index, 2, j]), 4),
                "filtered_x_px": round(float(filtered[index, 0, j] * width), 2),
                "filtered_y_px": round(float(filtered[index, 1, j] * height), 2),
                "filtered_conf": round(float(filtered[index, 2, j]), 4),
                "observed": bool(observed_frames[index][j]),
                "inferred": bool(inferred_frames[index][j]),
                "track_id": identities[index], "selected_index": selected_indices[index],
                "detection_source": selected_sources[index],
                "ground_truth_x_px": "", "ground_truth_y_px": "",
                "visibility": "", "review_notes": "",
            })
    if review_rows:
        with (destination / "manual_review.csv").open("w", newline="") as handle:
            review_writer = csv.DictWriter(handle, fieldnames=list(review_rows[0]))
            review_writer.writeheader()
            review_writer.writerows(review_rows)
    np.savez_compressed(destination / "keypoints.npz", raw=raw, filtered=filtered,
                        timestamps_ms=np.asarray(frame_times), person_counts=np.asarray(people),
                        first_detection=np.asarray(api_frames), observed=np.asarray(observed_frames),
                        inferred=np.asarray(inferred_frames), ready=np.asarray(readiness),
                        track_id=np.asarray(identities), selected_index=np.asarray(selected_indices),
                        state=np.asarray(states), history_reset=np.asarray(resets),
                        recovery_attempted=np.asarray(recovery_attempts), recovered=np.asarray(recoveries),
                        selected_source=np.asarray(selected_sources))
    with (destination / "joints.csv").open("w", newline="") as handle:
        writer_csv = csv.DictWriter(handle, fieldnames=list(per_joint[0]))
        writer_csv.writeheader()
        writer_csv.writerows(per_joint)
    summary = {
        "video": str(video), "exercise": exercise, "frames_processed": len(raw),
        "source_frames": frame_count, "source_fps": fps, "width": width, "height": height,
        "frames_without_person": sum(c == 0 for c in people),
        "frames_with_multiple_people": sum(c > 1 for c in people),
        "raw_below_conf_025_pct": round(float((~observed).mean() * 100), 2),
        "zero_xy_with_conf_025_count": int(((raw[:, :2] == 0).all(axis=1) & observed).sum()),
        "mode": mode,
        "roi_recovery_enabled": recovery and mode == "stable",
        "recovery_attempts": int(sum(recovery_attempts)), "recovery_accepted_frames": int(sum(recoveries)),
        "frames_ready": int(sum(readiness)),
        "frames_without_selected_target": int(sum(i < 0 for i in selected_indices)),
        "frames_ambiguous": int(sum(s == "AMBIGUOUS" for s in states)),
        "history_resets": int(sum(resets)),
        "track_ids_acquired": len({i for i in identities if i >= 0}),
        "display_inferred_joint_frames": int(np.asarray(inferred_frames).sum()),
        "confidence_qualified_filter_shift_max_px": round(float(displacement[observed].max()), 3) if observed.any() else None,
        "detector_latency_median_ms": round(float(np.median(latencies)), 2),
        "detector_latency_p95_ms": round(float(np.percentile(latencies, 95)), 2),
        "wall_time_s": round(time.perf_counter() - started, 2),
        "preview": str(destination / "comparison.mp4"),
        "samples": [str(destination / f"sample_{rank}_frame_{index:04d}.jpg")
                    for rank, (_, index, _, _) in enumerate(candidates, 1)],
        "joints": per_joint,
    }
    (destination / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--video", type=Path, action="append", help="Repeat for each input video")
    parser.add_argument("--exercise", choices=sorted(set(EXERCISES.values())),
                        help="Exercise for inputs outside the benchmark folders")
    parser.add_argument("--max-frames", type=int, default=300)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--mode", choices=["stable", "legacy"], default="stable")
    parser.add_argument("--no-roi-recovery", action="store_true")
    args = parser.parse_args()
    if args.max_frames < 1 or args.threads < 1:
        parser.error("max-frames and threads must be positive")
    torch.set_num_threads(args.threads)
    cv2.setNumThreads(args.threads)
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(ROOT / "weights" / "yolov8n-pose.pt"))
    videos = args.video or [ROOT / "test_videos_benchmark" / item for item in DEFAULT_VIDEOS]
    results = []
    for video in videos:
        video = video.resolve()
        print(f"RUN {video.parent.name}/{video.name}", flush=True)
        result = compare_video(model, video, args.output, args.max_frames, args.imgsz, args.exercise,
                               args.mode, not args.no_roi_recovery, args.threads)
        results.append(result)
        print(json.dumps({k: v for k, v in result.items() if k not in ("joints", "samples")}), flush=True)
    report = {
        "warning": "No manual keypoint ground truth. Displacement is not accuracy; smoothing legitimately moves points.",
        "method": "CPU, sequential frames; stable uses the same PoseStream as app; legacy uses the first detection and EnhancedPoseProcessor.",
        "mode": args.mode,
        "platform": platform.platform(), "python": platform.python_version(),
        "packages": {name: version(name) for name in ("ultralytics", "torch", "opencv-python", "numpy")},
        "weights_sha256": hashlib.sha256((ROOT / "weights" / "yolov8n-pose.pt").read_bytes()).hexdigest(),
        "processor_sha256": hashlib.sha256((ROOT / "enhanced_pose_processor.py").read_bytes()).hexdigest(),
        "tracking_sha256": hashlib.sha256((ROOT / "pose_tracking.py").read_bytes()).hexdigest(),
        "detector_sha256": hashlib.sha256((ROOT / "pose_detector.py").read_bytes()).hexdigest(),
        "threads": args.threads, "imgsz": args.imgsz, "videos": results,
    }
    (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"REPORT {args.output / 'report.json'}", flush=True)


if __name__ == "__main__":
    main()
