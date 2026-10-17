"""COCO-17 RTMPose SimCC inference using the exported deployment metadata.

Uses existing NumPy/OpenCV/ONNX Runtime dependencies; no training framework.
The model/pipeline must be installed locally; inference never downloads files.
Reference: OpenMMLab RTMPose ONNX SDK (pipeline.json and SimCCLabel codec).
"""

import json
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

from pose_tracking import Candidate


def crop_transform(box, input_size, padding=1.25):
    box = np.asarray(box, dtype=np.float32)
    if box.shape != (4,) or not np.isfinite(box).all() or (box[2:] <= box[:2]).any():
        raise ValueError("Expected a finite, nonempty xyxy person box")
    center = (box[:2] + box[2:]) * .5
    extent = (box[2:] - box[:2]) * padding
    width, height = input_size
    aspect = width / height
    if extent[0] / extent[1] > aspect:
        extent[1] = extent[0] / aspect
    else:
        extent[0] = extent[1] * aspect
    ratio = np.asarray(input_size, dtype=np.float32) / extent
    affine = np.array([[ratio[0], 0, width * .5 - center[0] * ratio[0]],
                       [0, ratio[1], height * .5 - center[1] * ratio[1]]], dtype=np.float32)
    return affine, center, extent


def decode_simcc(simcc_x, simcc_y, center, extent, input_size, split_ratio=2.0):
    """Decode to original-image pixels; score is min of axis peak responses.

    SimCC response is not a calibrated probability and is not YOLO confidence.
    """
    if (simcc_x.ndim != 3 or simcc_y.ndim != 3 or simcc_x.shape[:2] != (1, 17)
            or simcc_y.shape[:2] != (1, 17)
            or simcc_x.shape[2] != int(input_size[0] * split_ratio)
            or simcc_y.shape[2] != int(input_size[1] * split_ratio)):
        raise ValueError("Expected COCO-17 SimCC outputs matching model input size")
    if not np.isfinite(simcc_x).all() or not np.isfinite(simcc_y).all():
        raise ValueError("Nonfinite RTMPose response")
    xy = np.stack([simcc_x[0].argmax(axis=1), simcc_y[0].argmax(axis=1)], axis=1).astype(np.float32)
    scores = np.minimum(simcc_x[0].max(axis=1), simcc_y[0].max(axis=1))
    xy = xy / split_ratio / input_size * extent + center - extent * .5
    xy[scores <= 0] = 0
    return xy.astype(np.float32), scores.astype(np.float32)


class RTMPoseEstimator:
    def __init__(self, model_path, threads=2):
        self.path = Path(model_path).resolve()
        if not self.path.is_file():
            raise FileNotFoundError(f"Local RTMPose model not found: {self.path}")
        if threads < 1:
            raise ValueError("threads must be positive")
        metadata = json.loads(self.path.with_name("pipeline.json").read_text())
        tasks = metadata["pipeline"]["tasks"]
        transforms = tasks[0]["transforms"]
        transform = {step["type"]: step for step in transforms}
        crop = transform["TopDownGetBboxCenterScale"]
        self.input_size = np.asarray(crop["image_size"], dtype=np.float32)
        self.padding = float(crop["padding"])
        normalizer = transform["Normalize"]
        self.mean = np.asarray(normalizer["mean"], dtype=np.float32)
        self.std = np.asarray(normalizer["std"], dtype=np.float32)
        self.to_rgb = bool(normalizer["to_rgb"])
        codec = tasks[-1]["params"]
        if (codec["type"] != "SimCCLabel" or codec.get("use_dark", False)
                or codec.get("normalize", False) or self.input_size.shape != (2,)
                or not np.isfinite(self.input_size).all() or (self.input_size <= 0).any()
                or self.mean.shape != (3,) or self.std.shape != (3,)
                or not np.isfinite(self.mean).all() or not np.isfinite(self.std).all()
                or (self.std <= 0).any() or not np.isfinite(self.padding) or self.padding <= 0):
            raise ValueError("Unsupported RTMPose preprocessing/SimCC configuration")
        self.split_ratio = float(codec["simcc_split_ratio"])
        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        # Don't compete with OpenCV/PyTorch for CPU between inference calls.
        options.add_session_config_entry("session.intra_op.allow_spinning", "0")
        self.session = ort.InferenceSession(str(self.path), sess_options=options,
                                           providers=["CPUExecutionProvider"])
        inputs = self.session.get_inputs()
        outputs = self.session.get_outputs()
        width, height = (int(v) for v in self.input_size)
        if (len(inputs) != 1 or inputs[0].shape[1:] != [3, height, width]
                or {o.name for o in outputs} != {"simcc_x", "simcc_y"}
                or any(isinstance(o.shape[1], int) and o.shape[1] != 17 for o in outputs)):
            raise ValueError("RTMPose model must have COCO-17 SimCC outputs and matching input shape")
        self.input_name = inputs[0].name

    def preprocess(self, frame, box):
        affine, center, extent = crop_transform(box, self.input_size, self.padding)
        crop = cv2.warpAffine(frame, affine, tuple(int(v) for v in self.input_size),
                              flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        if self.to_rgb:
            crop = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        crop = (crop.astype(np.float32) - self.mean) / self.std
        tensor = np.ascontiguousarray(crop.transpose(2, 0, 1)[None])
        return tensor, center, extent

    def estimate(self, frame, boxes):
        """Return unthresholded pixel coordinates and raw SimCC peak responses."""
        if frame.ndim != 3 or frame.shape[2] != 3 or not frame.size:
            raise ValueError("Expected nonempty BGR frame")
        points, scores = [], []
        for box in boxes:
            tensor, center, extent = self.preprocess(frame, box)
            x, y = self.session.run(["simcc_x", "simcc_y"], {self.input_name: tensor})
            xy, score = decode_simcc(x, y, center, extent, self.input_size, self.split_ratio)
            points.append(xy)
            scores.append(score)
        return (np.asarray(points, dtype=np.float32).reshape(-1, 17, 2),
                np.asarray(scores, dtype=np.float32).reshape(-1, 17))

    def refine(self, frame, candidates):
        """Estimate joints for box metadata (Candidate or detection-only PersonBox).

        Existing keypoints are never read, so a detector needs no pose head.
        """
        points, scores = self.estimate(frame, [c.box for c in candidates])
        height, width = frame.shape[:2]
        result = []
        for candidate, xy, score in zip(candidates, points, scores):
            valid = ((score > 0) & (xy >= 0).all(axis=1)
                     & (xy <= [width, height]).all(axis=1) & np.any(xy != 0, axis=1))
            pose = np.vstack([(xy / [width, height]).T, np.clip(score, 0, 1)]).astype(np.float32)
            pose[:, ~valid] = 0
            result.append(Candidate(candidate.index, candidate.box.copy(), pose,
                                    candidate.confidence, candidate.source))
        return result
