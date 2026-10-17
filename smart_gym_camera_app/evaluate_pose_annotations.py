"""Evaluate manually reviewed CSV keypoints using a declared torso PCK protocol.

Only visibility=visible (or COCO value 2) is scored. Missing predictions fail
PCK rather than disappearing from the denominator. No labels means no score.
"""

import argparse
import csv
import json
import math
from pathlib import Path


def evaluate(files, threshold=0.1, confidence=0.5):
    if not math.isfinite(threshold) or threshold <= 0 or not 0 <= confidence <= 1:
        raise ValueError("threshold must be positive and confidence must be in [0, 1]")
    frames = {}
    for source in files:
        source = Path(source).resolve()
        with source.open(newline="", encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                if row.get("visibility", "").strip().lower() not in ("visible", "2"):
                    continue
                x, y = row.get("ground_truth_x_px", ""), row.get("ground_truth_y_px", "")
                if x == "" or y == "":
                    continue
                point = (float(x), float(y))
                if not all(math.isfinite(v) for v in point):
                    raise ValueError(f"Non-finite ground-truth coordinate in {source}")
                key = (str(source), row.get("source_image", ""), row.get("frame_index", ""))
                joints = frames.setdefault(key, {})
                joint = row["joint"]
                if joint in joints:
                    raise ValueError(f"Duplicate joint {joint} in frame {key}")
                joints[joint] = (row, point)
    if not frames:
        raise ValueError("No visible, manually annotated keypoints; accuracy cannot be calculated")
    scored = []
    skipped_frames = 0
    for frame, joints in frames.items():
        lengths = []
        for shoulder, hip in [("left_shoulder", "left_hip"), ("right_shoulder", "right_hip")]:
            if shoulder in joints and hip in joints:
                lengths.append(math.dist(joints[shoulder][1], joints[hip][1]))
        lengths = [v for v in lengths if v > 1]
        if not lengths:
            skipped_frames += 1
            continue
        scale = sum(lengths) / len(lengths)
        for joint, (row, target) in joints.items():
            item = {"joint": joint}
            for kind in ("raw", "filtered"):
                try:
                    x, y = float(row[f"{kind}_x_px"]), float(row[f"{kind}_y_px"])
                    score = float(row[f"{kind}_conf"])
                except (KeyError, ValueError) as error:
                    raise ValueError(f"Invalid {kind} prediction for {joint} in {frame}") from error
                available = (all(math.isfinite(v) for v in (x, y, score))
                             and score >= confidence and (x != 0 or y != 0))
                if kind == "filtered" and row.get("inferred", "").lower() in ("true", "1"):
                    available = False
                distance = math.dist((x, y), target) if available else None
                item[kind] = {"available": available, "error_px": distance,
                              "correct": available and distance <= threshold * scale}
            scored.append(item)
    if not scored:
        raise ValueError("No frames have a visible annotated shoulder/hip pair for torso normalization")

    def aggregate(rows, kind):
        available = [r[kind]["error_px"] for r in rows if r[kind]["available"]]
        return {"ground_truth_joints": len(rows), "available_predictions": len(available),
                "coverage": len(available) / len(rows),
                "pck": sum(r[kind]["correct"] for r in rows) / len(rows),
                "mean_pixel_error_on_available": sum(available) / len(available) if available else None}

    return {"protocol": "PCK normalized by mean visible annotated shoulder-to-hip length; missing predictions fail",
            "pck_threshold": threshold, "confidence_threshold": confidence,
            "annotated_frames": len(frames), "frames_skipped_without_torso_reference": skipped_frames,
            "raw": aggregate(scored, "raw"), "filtered": aggregate(scored, "filtered"),
            "per_joint": {joint: {kind: aggregate([r for r in scored if r["joint"] == joint], kind)
                                  for kind in ("raw", "filtered")}
                          for joint in sorted({r["joint"] for r in scored})}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path, nargs="+")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threshold", type=float, default=0.1)
    parser.add_argument("--confidence", type=float, default=0.5)
    args = parser.parse_args()
    try:
        report = evaluate(args.csv, args.threshold, args.confidence)
    except ValueError as error:
        parser.error(str(error))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
