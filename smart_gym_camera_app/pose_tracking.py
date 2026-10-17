"""Single-person association and time-bounded pose filtering in image space.

Association uses geometry, not biometric re-identification. Ambiguous matches
are withheld. Inferred joints are display-only and never qualify frame quality.
"""

from dataclasses import dataclass
import math

import numpy as np

from enhanced_pose_processor import sanitize_image_keypoints


def visible_joints(pose, threshold=0.5):
    return (np.isfinite(pose).all(axis=0) & (pose[2] >= threshold)
            & np.any(pose[:2] != 0, axis=0))


@dataclass
class Candidate:
    index: int
    box: np.ndarray
    keypoints: np.ndarray
    confidence: float
    source: str = "full"


def _numpy(value):
    if hasattr(value, "cpu"):
        value = value.cpu()
    return np.asarray(value)


def extract_candidates(result, width, height):
    """Read all pose detections; reject empty/malformed model outputs."""
    if width <= 0 or height <= 0 or not np.isfinite([width, height]).all():
        raise ValueError("Frame dimensions must be finite and positive")
    if result is None or result.keypoints is None or result.boxes is None:
        return []
    points = _numpy(result.keypoints.data)
    boxes = _numpy(result.boxes.xyxy)
    scores = _numpy(result.boxes.conf)
    if (points.ndim != 3 or points.shape[1:] != (17, 3)
            or boxes.ndim != 2 or boxes.shape[1:] != (4,) or scores.ndim != 1):
        return []
    candidates = []
    for index in range(min(len(points), len(boxes), len(scores))):
        box = boxes[index].astype(np.float32)
        if (not np.isfinite(box).all() or not np.isfinite(scores[index])
                or not 0 <= scores[index] <= 1):
            continue
        box[[0, 2]] = np.clip(box[[0, 2]], 0, width)
        box[[1, 3]] = np.clip(box[[1, 3]], 0, height)
        if not np.isfinite(box).all() or box[2] <= box[0] or box[3] <= box[1]:
            continue
        pose = points[index].T.astype(np.float32).copy()
        pose[0] /= width
        pose[1] /= height
        pose = sanitize_image_keypoints(pose)
        valid = ((pose[:2] >= 0).all(axis=0) & (pose[:2] <= 1).all(axis=0)
                 & (pose[2] <= 1))
        pose[:, ~valid] = 0
        candidates.append(Candidate(index, box, pose, float(scores[index])))
    return candidates


def box_iou(a, b):
    overlap = np.maximum(0, np.minimum(a[2:], b[2:]) - np.maximum(a[:2], b[:2]))
    intersection = float(np.prod(overlap))
    area_a, area_b = float(np.prod(a[2:] - a[:2])), float(np.prod(b[2:] - b[:2]))
    return intersection / max(area_a + area_b - intersection, 1e-6)


@dataclass
class Selection:
    candidate: Candidate | None
    track_id: int | None
    state: str
    reset_history: bool


class PersonSelector:
    def __init__(self, lost_timeout=1.0, history_gap=0.25, min_joints=6, confidence_threshold=0.5):
        if not math.isfinite(confidence_threshold) or not 0 < confidence_threshold <= 1:
            raise ValueError("confidence_threshold must be in (0,1]")
        self.confidence_threshold = confidence_threshold
        self.lost_timeout = lost_timeout
        self.history_gap = history_gap
        self.min_joints = min_joints
        self.next_id = 1
        self.reset()

    def reset(self):
        self.box = None
        self.track_id = None
        self.last_seen = None
        self.last_timestamp = None
        self.history_cleared = True
        self.requested_point = None
        self.expired = False
        self.pose = None

    def select_at(self, x, y):
        self.reset()
        self.requested_point = (x, y)

    def propose(self, candidates, frame_size=None):
        """Read-only association, also used to validate recovery detections."""
        if self.expired:
            return None, "RESELECT_REQUIRED"
        eligible = [c for c in candidates if visible_joints(c.keypoints, self.confidence_threshold).sum() >= self.min_joints]
        if self.box is None:
            if self.requested_point is not None:
                x, y = self.requested_point
                eligible = [c for c in eligible if c.box[0] <= x <= c.box[2]
                            and c.box[1] <= y <= c.box[3]]
                # A click inside overlapping boxes is not an unambiguous choice.
                if len(eligible) > 1:
                    return None, "AMBIGUOUS"
            if not eligible:
                return None, "NO_TARGET"
            return max(eligible, key=lambda c: (
                int(visible_joints(c.keypoints, self.confidence_threshold).sum()), c.confidence,
                float(np.prod(c.box[2:] - c.box[:2])))), "TRACKED"
        ranked = []
        diagonal = max(float(np.linalg.norm(self.box[2:] - self.box[:2])), 1)
        center = (self.box[:2] + self.box[2:]) / 2
        area = max(float(np.prod(self.box[2:] - self.box[:2])), 1)
        for candidate in eligible:
            distance = float(np.linalg.norm((candidate.box[:2] + candidate.box[2:]) / 2 - center)) / diagonal
            ratio = float(np.prod(candidate.box[2:] - candidate.box[:2])) / area
            overlap = box_iou(self.box, candidate.box)
            if not (0.3 <= ratio <= 3.0 and (overlap >= 0.15 or distance <= 0.3)):
                continue
            score = 0.8 * overlap + 0.2 * math.exp(-distance)
            if self.pose is not None and frame_size is not None:
                shared = (visible_joints(self.pose, self.confidence_threshold)
                          & visible_joints(candidate.keypoints, self.confidence_threshold))
                if shared.sum() >= 4:
                    delta = (candidate.keypoints[:2, shared] - self.pose[:2, shared]).T * frame_size
                    joint_distance = float(np.median(np.linalg.norm(delta, axis=1))) / diagonal
                    # Pose changes alone are not identity loss: frontal pushups
                    # and foreshortening can move visible joints substantially.
                    # Use this hard gate only when box continuity is weak too.
                    if joint_distance > 0.35 and overlap < 0.3:
                        continue
                    score = 0.75 * score + 0.25 * math.exp(-joint_distance * 6)
            ranked.append((score, candidate))
        ranked.sort(key=lambda item: item[0], reverse=True)
        if not ranked:
            return None, "TARGET_LOST"
        if len(ranked) > 1 and ranked[0][0] - ranked[1][0] < 0.06:
            return None, "AMBIGUOUS"
        return ranked[0][1], "TRACKED"

    def update(self, candidates, timestamp, frame_size=None):
        if not math.isfinite(timestamp):
            raise ValueError("Timestamp must be finite")
        reset_history = False
        if self.last_timestamp is not None and timestamp < self.last_timestamp:
            self.reset()
            reset_history = True
        self.last_timestamp = timestamp
        if (not self.expired and self.last_seen is not None
                and timestamp - self.last_seen > self.lost_timeout):
            # Never silently acquire a bystander after a long disappearance.
            self.expired = True
            self.history_cleared = True
            reset_history = True
        selected, state = self.propose(candidates, frame_size)
        if selected is not None:
            if self.track_id is None:
                self.track_id = self.next_id
                self.next_id += 1
                self.requested_point = None
                reset_history = True
            if self.last_seen is not None and timestamp - self.last_seen > self.history_gap:
                reset_history = True
            self.box = selected.box.copy()
            self.pose = selected.keypoints.copy()
            self.last_seen = timestamp
            self.history_cleared = False
            state = "TRACKED"
        elif self.last_seen is not None and timestamp - self.last_seen > self.history_gap:
            if not self.history_cleared:
                reset_history = True
                self.history_cleared = True
        return Selection(selected, self.track_id, state, reset_history)


class StablePoseFilter:
    def __init__(self, max_inference_gap=0.15, min_cutoff=4.0, beta=2.0, derivative_cutoff=1.0,
                 confidence_threshold=0.5):
        """One Euro filter in pixels; derivative gain uses torso lengths/sec.

        Algorithm reference: https://gery.casiez.net/1euro/
        Parameters are engineering defaults, not learned anatomical limits.
        """
        if (not np.isfinite([max_inference_gap, min_cutoff, beta, derivative_cutoff]).all()
                or max_inference_gap <= 0 or min_cutoff <= 0 or beta < 0 or derivative_cutoff <= 0):
            raise ValueError("Filter cutoffs/gap must be positive and beta nonnegative")
        self.max_inference_gap = max_inference_gap
        if not math.isfinite(confidence_threshold) or not 0 < confidence_threshold <= 1:
            raise ValueError("confidence_threshold must be in (0,1]")
        self.confidence_threshold = confidence_threshold
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.derivative_cutoff = derivative_cutoff
        self.reset()

    def reset(self):
        self.xy = np.zeros((2, 17), dtype=np.float32)
        self.velocity = np.zeros((2, 17), dtype=np.float32)
        self.previous_raw = np.zeros((2, 17), dtype=np.float32)
        self.derivative = np.zeros((2, 17), dtype=np.float32)
        self.seen_at = np.full(17, -np.inf)
        self.last_timestamp = None
        self.frame_size = None

    def update(self, raw, timestamp, width, height):
        if not np.isfinite([timestamp, width, height]).all() or width <= 0 or height <= 0:
            raise ValueError("Finite timestamp and positive frame dimensions required")
        if self.frame_size != (width, height) or (self.last_timestamp is not None
                                                 and timestamp < self.last_timestamp):
            self.reset()
        self.frame_size = (width, height)
        self.last_timestamp = timestamp
        raw = sanitize_image_keypoints(raw)
        observed = visible_joints(raw, self.confidence_threshold)
        inferred = np.zeros(17, dtype=bool)
        output = np.zeros((3, 17), dtype=np.float32)
        scale = np.array([[width], [height]], dtype=np.float32)
        pixels = raw[:2] * scale
        torso = []
        for shoulder, hip in [(5, 11), (6, 12)]:
            if observed[shoulder] and observed[hip]:
                torso.append(float(np.linalg.norm(pixels[:, shoulder] - pixels[:, hip])))
        torso_size = max(float(np.median(torso)) if torso else height * 0.2, 1)
        for j in range(17):
            age = timestamp - self.seen_at[j]
            if observed[j]:
                if 0 < age <= self.max_inference_gap:
                    speed = float(np.linalg.norm(pixels[:, j] - self.xy[:, j])) / (torso_size * age)
                    # Weak detections with an extreme discontinuity are withheld.
                    if raw[2, j] < self.confidence_threshold + 0.15 and speed > 12 and np.linalg.norm(pixels[:, j] - self.xy[:, j]) > torso_size * 0.3:
                        observed[j] = False
                    else:
                        derivative_alpha = 1 / (1 + 1 / (2 * math.pi * self.derivative_cutoff * age))
                        derivative = (pixels[:, j] - self.previous_raw[:, j]) / age
                        self.derivative[:, j] += derivative_alpha * (derivative - self.derivative[:, j])
                        cutoff = self.min_cutoff + self.beta * float(np.linalg.norm(self.derivative[:, j])) / torso_size
                        alpha = 1 / (1 + 1 / (2 * math.pi * cutoff * age))
                        next_xy = alpha * pixels[:, j] + (1 - alpha) * self.xy[:, j]
                        self.velocity[:, j] = (next_xy - self.xy[:, j]) / age
                        self.xy[:, j] = next_xy
                elif age > self.max_inference_gap:
                    self.xy[:, j] = pixels[:, j]
                    self.velocity[:, j] = 0
                    self.derivative[:, j] = 0
                else:  # Duplicate timestamp: update position without dividing by dt.
                    self.xy[:, j] = pixels[:, j]
                    self.velocity[:, j] = 0
                    self.derivative[:, j] = 0
                if observed[j]:
                    self.previous_raw[:, j] = pixels[:, j]
                    self.seen_at[j] = timestamp
                    output[:2, j] = self.xy[:, j] / scale[:, 0]
                    output[2, j] = raw[2, j]
                    continue
            if 0 <= age <= self.max_inference_gap:
                displacement = self.velocity[:, j] * age
                distance = float(np.linalg.norm(displacement))
                if distance > torso_size * 0.25:
                    displacement *= torso_size * 0.25 / distance
                predicted = self.xy[:, j] + displacement
                if 0 <= predicted[0] <= width and 0 <= predicted[1] <= height:
                    output[:2, j] = predicted / scale[:, 0]
                    output[2, j] = 0.2  # Display quality only, not observed confidence.
                    inferred[j] = True
        return output, observed, inferred


def frame_quality(observed, exercise):
    """Require real observations of the joints used by the online rep tracker."""
    if observed.sum() < 6:
        return False
    if exercise in ("jump_jack", "jumping_jacks"):
        return bool(observed[[5, 6, 9, 10, 11, 12, 15, 16]].all())
    if exercise in ("pushup", "push_up", "pushups"):
        return bool(observed[[5, 6, 7, 8, 9, 10]].all() and observed[[11, 12]].any())
    if exercise in ("pull_up", "bench_pressing"):
        return bool(observed[[5, 6, 7, 8, 9, 10]].all())
    if exercise in ("crunch", "situp", "sit_up"):
        return bool(observed[[5, 6, 11, 12, 13, 14]].all())
    return any(observed[list(side)].all() for side in
               [(5, 11, 13, 15), (6, 12, 14, 16)])


@dataclass
class PoseFrame:
    raw: np.ndarray
    display: np.ndarray
    analysis: np.ndarray
    observed: np.ndarray
    inferred: np.ndarray
    selection: Selection
    ready: bool
    reset_history: bool
    detection_count: int


class PoseStream:
    def __init__(self, exercise="squat", confidence_threshold=0.5):
        self.confidence_threshold = confidence_threshold
        self.selector = PersonSelector(confidence_threshold=confidence_threshold)
        self.filter = StablePoseFilter(confidence_threshold=confidence_threshold)
        self.reset(exercise)

    def reset(self, exercise=None):
        if exercise is not None:
            self.exercise = exercise
        self.selector.reset()
        self.filter.reset()
        self.last_ready = None
        self.quality_cleared = True

    def select_at(self, x, y):
        self.reset()
        self.selector.select_at(x, y)

    def update(self, candidates, timestamp, width, height):
        if not np.isfinite([timestamp, width, height]).all() or width <= 0 or height <= 0:
            raise ValueError("Finite timestamp and positive frame dimensions required")
        if self.filter.frame_size not in (None, (width, height)):
            self.reset()
        selection = self.selector.update(candidates, timestamp, (width, height))
        reset_history = selection.reset_history
        if reset_history:
            self.filter.reset()
            self.last_ready = None
            self.quality_cleared = True
        raw = (selection.candidate.keypoints.copy() if selection.candidate is not None
               else np.zeros((3, 17), dtype=np.float32))
        display, observed, inferred = self.filter.update(raw, timestamp, width, height)
        ready = selection.candidate is not None and frame_quality(observed, self.exercise)
        if ready:
            if self.last_ready is not None and timestamp - self.last_ready > 0.25:
                reset_history = True
            self.last_ready = timestamp
            self.quality_cleared = False
        elif self.last_ready is not None and timestamp - self.last_ready > 0.25:
            if not self.quality_cleared:
                reset_history = True
                self.quality_cleared = True
        analysis = display.copy()
        analysis[:, ~observed] = 0
        # Keep classifier input as real, unfiltered observations; do not feed
        # display-only extrapolation or apply the online filter a second time.
        raw[:, ~observed] = 0
        return PoseFrame(raw, display, analysis, observed, inferred, selection,
                         ready, reset_history, len(candidates))
