"""Validate saved benchmark observations and aggregate per-frame measurements.

No inference or ground-truth accuracy evaluation is performed here.
"""

import argparse
from collections import Counter
import json
from pathlib import Path

import cv2
import numpy as np

from .benchmark_pose_backends import timing_summary


def summarize(report_path, verify_media=False):
    report = json.loads(report_path.read_text())
    if report['failures'] or not report['videos']:
        raise ValueError('A completed report without failed videos is required')
    names = list(report['configs'])
    totals = {name: Counter() for name in names}
    latencies = {name: [] for name in names}
    checked = []
    for row in report['videos']:
        path = report_path.parent / row['archive']
        with np.load(path, allow_pickle=False) as data:
            for name in names:
                frames = row['frames']
                selected, observed = data[name+'_selected'], data[name+'_observed']
                offsets, boxes = data[name+'_frame_offsets'], data[name+'_boxes']
                poses, scores = data[name+'_candidates'], data[name+'_box_scores']
                if (selected.shape != (frames, 3, 17) or observed.shape != (frames, 17)
                        or not np.isfinite(selected).all() or observed.dtype != np.bool_
                        or (selected * (~observed[:, None, :])).any()
                        or (selected[:, :2] < 0).any() or (selected[:, :2] > 1).any()):
                    raise ValueError(f'Invalid observed-only joint cache: {path} / {name}')
                if (offsets.shape != (frames+1,) or offsets[0] != 0 or offsets[-1] != len(boxes)
                        or (np.diff(offsets) < 0).any() or boxes.shape != (len(boxes), 4)
                        or poses.shape != (len(boxes), 3, 17) or scores.shape != (len(boxes),)
                        or not all(np.isfinite(x).all() for x in [boxes, poses, scores])
                        or (boxes[:, 2:] <= boxes[:, :2]).any()
                        or (scores < 0).any() or (scores > 1).any()):
                    raise ValueError(f'Invalid candidate cache: {path} / {name}')
                measurements = data[name+'_latency_ms']
                if measurements.shape != (frames,) or not np.isfinite(measurements).all() or (measurements < 0).any():
                    raise ValueError(f'Invalid latency cache: {path} / {name}')
                stats = row['arms'][name]
                if (int(data[name+'_ready'].sum()) != stats['ready_frames']
                        or int(observed.sum()) != stats['observed_joint_frames']
                        or int((np.diff(offsets) == 0).sum()) != stats['no_fullframe_person_frames']):
                    raise ValueError(f'Report/cache count mismatch: {path} / {name}')
                for key, value in stats.items():
                    if key == 'inference_latency':
                        continue
                    if key == 'longest_no_person_run':
                        totals[name][key] = max(totals[name][key], value)
                    else:
                        totals[name][key] += value
                latencies[name].extend(measurements.tolist())
        media_count = None
        if verify_media:
            media = path.with_suffix('.mp4')
            capture = cv2.VideoCapture(str(media))
            media_count = 0
            try:
                while capture.isOpened():
                    ok, _ = capture.read()
                    if not ok:
                        break
                    media_count += 1
            finally:
                capture.release()
            if media_count != row['frames']:
                raise ValueError(f'Video frame count mismatch: {media}: {media_count}')
        checked.append({'archive': path.name, 'frames': row['frames'], 'decoded_media_frames': media_count})
    return {'scope': 'Availability and latency; no expert keypoint ground truth, therefore not accuracy.',
            'videos': len(report['videos']), 'frames_per_backend': sum(v['frames'] for v in report['videos']),
            'arms': {name: {**dict(totals[name]),
                           'ready_percent': 100*totals[name]['ready_frames']/totals[name]['frames'],
                           'inference_latency': timing_summary(latencies[name])} for name in names},
            'verified_archives': checked, 'failures': report['failures']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--verify-media', action='store_true')
    args = parser.parse_args()
    result = summarize(args.report, args.verify_media)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
