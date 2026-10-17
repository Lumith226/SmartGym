"""Full-frame pose inference with bounded, conservative ROI recovery.

No per-joint fusion: one detection supplies the entire observed skeleton.
Recovery never bypasses the stream's identity or observation-quality gates.
"""

from dataclasses import dataclass
import math
import time

import numpy as np
import torch

from pose_tracking import Candidate, extract_candidates, frame_quality, visible_joints


def padded_region(box, width, height, padding=0.3):
    """Pad each side, preserve aspect ratio, and clip to the original image."""
    extent = box[2:] - box[:2]
    low = np.floor(box[:2] - padding * extent).astype(int)
    high = np.ceil(box[2:] + padding * extent).astype(int)
    x1, y1 = np.maximum(low, 0)
    x2, y2 = np.minimum(high, [width, height])
    if x2 - x1 < 32 or y2 - y1 < 32:
        return None
    return int(x1), int(y1), int(x2), int(y2)


def restore_crop_candidates(candidates, region, width, height):
    """Map local crop coordinates back; masked (0,0) joints must stay missing."""
    x1, y1, x2, y2 = region
    restored = []
    crop_size = np.array([[x2 - x1], [y2 - y1]], dtype=np.float32)
    offset = np.array([[x1], [y1]], dtype=np.float32)
    for candidate in candidates:
        pose = candidate.keypoints.copy()
        valid = visible_joints(pose, 0.00001)
        local = pose[:2] * crop_size
        # Predictions touching an internal crop edge may be clipped limbs.
        clipped = (((local[0] < 2) & (x1 > 0))
                   | ((local[0] > x2 - x1 - 2) & (x2 < width))
                   | ((local[1] < 2) & (y1 > 0))
                   | ((local[1] > y2 - y1 - 2) & (y2 < height)))
        valid &= ~clipped
        pose[:, ~valid] = 0
        pose[:2, valid] = ((local + offset) / np.array([[width], [height]]))[:, valid]
        box = candidate.box + np.array([x1, y1, x1, y1], dtype=np.float32)
        restored.append(Candidate(candidate.index, box, pose, candidate.confidence, "roi"))
    return restored


@dataclass
class DetectionFrame:
    candidates: list
    full_candidates: list
    recovered: bool
    recovery_attempted: bool
    latency_ms: float


class PoseDetector:
    def __init__(self, model, device="cpu", image_size=640, recovery=True,
                 recovery_interval=0.1, recovery_age=0.6, cpu_threads=2):
        if image_size < 32 or image_size % 32:
            raise ValueError("image_size must be a positive multiple of 32")
        self.model = model
        self.device = device
        self.image_size = image_size
        self.recovery = recovery
        self.recovery_interval = recovery_interval
        self.recovery_age = recovery_age
        if cpu_threads < 1:
            raise ValueError("cpu_threads must be positive")
        self.cpu_threads = cpu_threads
        self.reset()

    def reset(self):
        self.last_retry = -math.inf
        self.last_timestamp = None
        self.frame_size = None
        self.track_id = None

    def _infer(self, frame):
        if self.device == "cpu" and torch.get_num_threads() != self.cpu_threads:
            torch.set_num_threads(self.cpu_threads)
        results = self.model(frame, verbose=False, device=self.device, imgsz=self.image_size)
        # Ultralytics 8.3 resets this during first-time CPU predictor setup.
        if self.device == "cpu" and torch.get_num_threads() != self.cpu_threads:
            torch.set_num_threads(self.cpu_threads)
        height, width = frame.shape[:2]
        return extract_candidates(results[0], width, height) if results else []

    def detect(self, frame, timestamp, stream):
        if not math.isfinite(timestamp):
            raise ValueError("Timestamp must be finite")
        height, width = frame.shape[:2]
        if (self.frame_size != (width, height) or self.track_id != stream.selector.track_id
                or (self.last_timestamp is not None and timestamp < self.last_timestamp)):
            self.reset()
        self.frame_size = (width, height)
        self.track_id = stream.selector.track_id
        self.last_timestamp = timestamp
        started = time.perf_counter()
        full = self._infer(frame)
        candidates = full
        attempted = recovered = False
        selector = stream.selector
        threshold = stream.confidence_threshold
        current, state = selector.propose(full, (width, height))
        # Always inspect the full image. Retry only a recently tracked person;
        # don't use a stale crop, resolve ambiguous people, or retry every frame.
        can_retry = (self.recovery and state != "AMBIGUOUS" and not selector.expired
                     and stream.filter.frame_size in (None, (width, height))
                     and selector.box is not None and selector.last_seen is not None
                     and 0 <= timestamp - selector.last_seen <= self.recovery_age
                     and timestamp - self.last_retry >= self.recovery_interval
                     and (current is None or not frame_quality(visible_joints(current.keypoints, threshold), stream.exercise)))
        region = padded_region(current.box if current is not None else selector.box,
                               width, height) if can_retry else None
        # An almost full-image crop provides little additional detail.
        if region is not None and (region[2] - region[0]) * (region[3] - region[1]) < width * height * 0.95:
            attempted = True
            self.last_retry = timestamp
            x1, y1, x2, y2 = region
            local = self._infer(frame[y1:y2, x1:x2])
            mapped = restore_crop_candidates(local, region, width, height)
            retry, _ = selector.propose(mapped, (width, height))
            if retry is not None:
                retry_mask = visible_joints(retry.keypoints, threshold)
                current_mask = visible_joints(current.keypoints, threshold) if current is not None else np.zeros(17, bool)
                shared = retry_mask & current_mask
                consistent = current is None
                if current is not None and shared.sum() >= 4:
                    delta = (retry.keypoints[:2, shared] - current.keypoints[:2, shared]).T * [width, height]
                    diagonal = max(float(np.linalg.norm(current.box[2:] - current.box[:2])), 1)
                    consistent = float(np.median(np.linalg.norm(delta, axis=1))) < diagonal * 0.12
                improved = (current is None or (
                    frame_quality(retry_mask, stream.exercise)
                    and not frame_quality(current_mask, stream.exercise)
                    and int(retry_mask.sum()) >= int(current_mask.sum())))
                if consistent and improved:
                    # Replace only the matched detection, preserving bystanders
                    # so the final selector can still withhold ambiguous matches.
                    candidates = [c for c in full if c is not current] + [retry]
                    final, _ = selector.propose(candidates, (width, height))
                    recovered = final is retry
                    if not recovered:
                        candidates = full
        return DetectionFrame(candidates, full, recovered, attempted,
                              (time.perf_counter() - started) * 1000)


class RTMPoseDetector(PoseDetector):
    """Use existing YOLO person boxes and RTMPose for COCO-17 coordinates."""

    def __init__(self, model, rtmpose_model, **kwargs):
        super().__init__(model, **kwargs)
        from rtmpose_estimator import RTMPoseEstimator
        self.estimator = RTMPoseEstimator(rtmpose_model, threads=self.cpu_threads)

    def _infer(self, frame):
        boxes = super()._infer(frame)
        return self.estimator.refine(frame, boxes)
