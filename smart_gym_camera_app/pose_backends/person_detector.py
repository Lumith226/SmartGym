"""Detection-only YOLO adapter. It never reads or fabricates keypoints."""

from dataclasses import dataclass
import math

import numpy as np
import torch


@dataclass
class PersonBox:
    index: int
    box: np.ndarray
    confidence: float
    source: str = "full"


def _numpy(value):
    if hasattr(value, "cpu"):
        value = value.cpu()
    return np.asarray(value)


def extract_person_boxes(result, width, height, min_confidence=.25):
    """Return valid COCO person boxes, retaining original detection indices."""
    if width <= 0 or height <= 0 or not np.isfinite([width, height]).all():
        raise ValueError("Frame dimensions must be finite and positive")
    if result is None or result.boxes is None:
        return []
    boxes = _numpy(result.boxes.xyxy)
    scores = _numpy(result.boxes.conf)
    classes = _numpy(result.boxes.cls)
    if (boxes.ndim != 2 or boxes.shape[1:] != (4,)
            or scores.shape != (len(boxes),) or classes.shape != (len(boxes),)):
        raise ValueError("Malformed YOLO detection outputs")
    people = []
    for index, (box, score, category) in enumerate(zip(boxes, scores, classes)):
        if (category != 0 or not np.isfinite(score)
                or not min_confidence <= score <= 1 or not np.isfinite(box).all()):
            continue
        box = box.astype(np.float32).copy()
        box[[0, 2]] = np.clip(box[[0, 2]], 0, width)
        box[[1, 3]] = np.clip(box[[1, 3]], 0, height)
        if box[2] > box[0] and box[3] > box[1]:
            people.append(PersonBox(index, box, float(score)))
    return people


class YOLOPersonDetector:
    """Run an actual COCO detection model, selecting class 0 = person."""

    def __init__(self, model, device="cpu", image_size=640, cpu_threads=2,
                 confidence=.25, iou=.7):
        if getattr(model, "task", None) != "detect":
            raise ValueError("YOLO-Detect + RTMPose requires a detection model, not a pose model")
        names = model.names
        person_name = names.get(0) if isinstance(names, dict) else names[0] if names else None
        if person_name != "person":
            raise ValueError("Expected a COCO detector with class 0 named 'person'")
        if (not math.isfinite(confidence) or not 0 < confidence <= 1
                or not math.isfinite(iou) or not 0 < iou <= 1):
            raise ValueError("Detection confidence and IoU must be in (0,1]")
        if image_size < 32 or image_size % 32 or cpu_threads < 1:
            raise ValueError("Invalid image size or CPU thread count")
        self.model, self.device = model, device
        self.image_size, self.cpu_threads = image_size, cpu_threads
        self.confidence, self.iou = confidence, iou

    def detect(self, frame):
        if frame.ndim != 3 or frame.shape[2] != 3 or not frame.size:
            raise ValueError("Expected a nonempty BGR frame")
        if self.device == "cpu" and torch.get_num_threads() != self.cpu_threads:
            torch.set_num_threads(self.cpu_threads)
        results = self.model(frame, verbose=False, device=self.device, imgsz=self.image_size,
                             classes=[0], conf=self.confidence, iou=self.iou)
        # Ultralytics can reset the thread count during its first predictor setup.
        if self.device == "cpu" and torch.get_num_threads() != self.cpu_threads:
            torch.set_num_threads(self.cpu_threads)
        height, width = frame.shape[:2]
        return extract_person_boxes(results[0], width, height, self.confidence) if results else []
