"""YOLO detection boxes -> RTMPose joints -> shared conservative ROI recovery."""

from pose_detector import PoseDetector
from rtmpose_estimator import RTMPoseEstimator

from .person_detector import YOLOPersonDetector


class YOLODetectRTMPoseDetector(PoseDetector):
    """One pose head only: no YOLO-Pose inference and no per-joint fusion.

    PoseDetector supplies ROI coordinate restoration, retry limits and identity
    gates. Every full-image or ROI call runs detection-only YOLO + RTMPose.
    All person candidates remain available to the shared PersonSelector.
    """

    def __init__(self, model, rtmpose_model, detection_confidence=.25,
                 detection_iou=.7, **kwargs):
        super().__init__(model, **kwargs)
        self.person_detector = YOLOPersonDetector(
            model, self.device, self.image_size, self.cpu_threads,
            detection_confidence, detection_iou)
        self.estimator = RTMPoseEstimator(rtmpose_model, threads=self.cpu_threads)

    def _infer(self, frame):
        people = self.person_detector.detect(frame)
        # Only box/index/confidence/source enter the pose head, never YOLO joints.
        return self.estimator.refine(frame, people)
