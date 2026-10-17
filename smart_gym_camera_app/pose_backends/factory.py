"""Shared CLI/configuration for the GUI and reproducible backend benchmarks."""

from dataclasses import asdict, dataclass
import hashlib
import math
from pathlib import Path

from pose_detector import PoseDetector, RTMPoseDetector


ROOT = Path(__file__).resolve().parents[1]
BACKENDS = ("yolo", "yolo-detect-rtmpose", "rtmpose", "yolo-pose-rtmpose")


@dataclass(frozen=True)
class PoseBackendConfig:
    backend: str = "yolo"
    yolo_pose_model: Path = ROOT / "weights/yolov8n-pose.pt"
    person_model: Path = ROOT / "weights/detectors/yolov8n.pt"
    rtmpose_model: Path = ROOT / "weights/rtmpose/m/end2end.onnx"
    image_size: int = 640
    cpu_threads: int = 2
    recovery: bool = True
    min_score: float | None = None
    detection_confidence: float = .25
    detection_iou: float = .7
    device: str | int = "cpu"

    @property
    def canonical_backend(self):
        return "yolo-detect-rtmpose" if self.backend == "rtmpose" else self.backend

    @property
    def confidence_threshold(self):
        return self.min_score if self.min_score is not None else (.5 if self.backend == "yolo" else .3)

    def validate(self):
        if self.backend not in BACKENDS:
            raise ValueError(f"Unknown pose backend: {self.backend}")
        if self.image_size < 32 or self.image_size % 32 or self.cpu_threads < 1:
            raise ValueError("--pose-imgsz must be a positive multiple of 32; --pose-threads must be positive")
        for name, value in [("pose-min-score", self.confidence_threshold),
                            ("person-conf", self.detection_confidence), ("person-iou", self.detection_iou)]:
            if not math.isfinite(value) or not 0 < value <= 1:
                raise ValueError(f"--{name} must be in (0,1]")
        model = self.person_model if self.canonical_backend == "yolo-detect-rtmpose" else self.yolo_pose_model
        if not Path(model).is_file():
            raise FileNotFoundError(f"Local detector/pose model missing: {model}. Run python -m tools.fetch_pose_models")
        if self.backend != "yolo":
            if not Path(self.rtmpose_model).is_file():
                raise FileNotFoundError(f"Local RTMPose model missing: {self.rtmpose_model}. Run python -m tools.fetch_pose_models")
            if not Path(self.rtmpose_model).with_name("pipeline.json").is_file():
                raise FileNotFoundError("RTMPose requires pipeline.json next to the ONNX file")


def add_pose_arguments(parser):
    parser.add_argument("--pose-backend", choices=BACKENDS, default="yolo",
                        help="yolo: baseline; yolo-detect-rtmpose (alias rtmpose); yolo-pose-rtmpose: legacy comparison")
    parser.add_argument("--yolo-pose-model", type=Path, default=ROOT / "weights/yolov8n-pose.pt")
    parser.add_argument("--person-model", type=Path, default=ROOT / "weights/detectors/yolov8n.pt")
    parser.add_argument("--rtmpose-model", type=Path, default=ROOT / "weights/rtmpose/m/end2end.onnx")
    parser.add_argument("--pose-imgsz", type=int, default=640, help="YOLO input size, multiple of 32")
    parser.add_argument("--pose-threads", type=int, default=2, help="CPU threads per inference runtime")
    parser.add_argument("--pose-min-score", type=float, default=None, help="Joint threshold: YOLO .5; RTMPose .3 (different score scales)")
    parser.add_argument("--person-conf", type=float, default=.25, help="Person detection threshold, separate from joint score")
    parser.add_argument("--person-iou", type=float, default=.7, help="Person detection NMS IoU")
    parser.add_argument("--no-roi-recovery", action="store_true")


def config_from_args(args, device="cpu"):
    config = PoseBackendConfig(
        backend=args.pose_backend, yolo_pose_model=args.yolo_pose_model,
        person_model=args.person_model, rtmpose_model=args.rtmpose_model,
        image_size=args.pose_imgsz, cpu_threads=args.pose_threads,
        recovery=not args.no_roi_recovery, min_score=args.pose_min_score,
        detection_confidence=args.person_conf, detection_iou=args.person_iou, device=device)
    config.validate()
    return config


def build_pose_backend(config):
    """Validate every asset before loading; inference never downloads weights."""
    config.validate()
    options = dict(device=config.device, image_size=config.image_size,
                   recovery=config.recovery, cpu_threads=config.cpu_threads)
    from ultralytics import YOLO
    if config.canonical_backend == "yolo-detect-rtmpose":
        from .yolo_rtmpose import YOLODetectRTMPoseDetector
        model = YOLO(str(Path(config.person_model).resolve()))
        return YOLODetectRTMPoseDetector(model, config.rtmpose_model,
            detection_confidence=config.detection_confidence,
            detection_iou=config.detection_iou, **options)
    model = YOLO(str(Path(config.yolo_pose_model).resolve()))
    if getattr(model, "task", None) != "pose":
        raise ValueError("The YOLO-Pose backend requires a pose model")
    if config.backend == "yolo-pose-rtmpose":
        return RTMPoseDetector(model, config.rtmpose_model, **options)
    return PoseDetector(model, **options)


def describe_backend(config):
    """Record the effective configuration and exact local assets for a session."""
    config.validate()
    files = {"yolo_detect" if config.canonical_backend == "yolo-detect-rtmpose" else "yolo_pose":
             config.person_model if config.canonical_backend == "yolo-detect-rtmpose" else config.yolo_pose_model}
    if config.backend != "yolo":
        files.update(rtmpose=config.rtmpose_model,
                     rtmpose_pipeline=Path(config.rtmpose_model).with_name("pipeline.json"))
    assets = {name: {"path": str(Path(p).resolve()),
                     "sha256": hashlib.sha256(Path(p).read_bytes()).hexdigest()}
              for name, p in files.items()}
    return {"schema_version": 1, "backend": config.canonical_backend,
            "joint_threshold": config.confidence_threshold,
            "rtmpose_provider": "CPUExecutionProvider" if config.backend != "yolo" else None,
            "configuration": {k: str(v) if isinstance(v, Path) else v for k, v in asdict(config).items()},
            "assets": assets}
