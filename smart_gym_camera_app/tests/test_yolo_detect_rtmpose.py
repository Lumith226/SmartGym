"""Model-free contracts for actual detection-only composition and installation."""

import argparse
from dataclasses import replace
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np

from pose_backends.factory import PoseBackendConfig, add_pose_arguments, config_from_args, build_pose_backend, describe_backend
from pose_backends.person_detector import YOLOPersonDetector, extract_person_boxes
from pose_backends.yolo_rtmpose import YOLODetectRTMPoseDetector
from pose_detector import padded_region
from pose_tracking import Candidate, PoseStream
from test_pose_keypoints import standing_pose
from tools import fetch_pose_models


def detection(boxes, scores=None, classes=None):
    n = len(boxes)
    # Deliberately no keypoints field: detection-only output must work.
    return SimpleNamespace(boxes=SimpleNamespace(
        xyxy=np.array(boxes, dtype=np.float32).reshape(-1, 4),
        conf=np.array(scores if scores is not None else [.9] * n),
        cls=np.array(classes if classes is not None else [0] * n)))


class FakeDetectModel:
    task = "detect"
    names = {0: "person", 1: "bicycle"}

    def __init__(self, outputs):
        self.outputs, self.calls = outputs, []

    def __call__(self, frame, **kwargs):
        self.calls.append(kwargs)
        return [self.outputs[min(len(self.calls) - 1, len(self.outputs) - 1)]]


class PersonDetectionTests(unittest.TestCase):
    def test_nonperson_weak_nonfinite_and_degenerate_boxes_are_excluded(self):
        result = detection([[1, 2, 100, 200], [3, 4, 100, 200], [1, 1, 2, 2],
                            [0, 0, 0, 3], [1, 2, np.nan, 4]],
                           [.8, .9, .1, .9, .9], [0, 1, 0, 0, 0])
        people = extract_person_boxes(result, 640, 480)
        self.assertEqual(len(people), 1)
        self.assertEqual(people[0].index, 0)
        self.assertFalse(hasattr(people[0], "keypoints"))

    def test_clipping_preserves_original_indices_and_box_coordinates(self):
        people = extract_person_boxes(detection([[1, 1, 2, 2], [-10, -20, 700, 500]],
                                               classes=[1, 0]), 640, 480)
        self.assertEqual(people[0].index, 1)
        np.testing.assert_array_equal(people[0].box, [0, 0, 640, 480])

    def test_empty_outputs_and_invalid_dimensions(self):
        self.assertEqual(extract_person_boxes(detection([]), 640, 480), [])
        self.assertEqual(extract_person_boxes(None, 640, 480), [])
        with self.assertRaises(ValueError):
            extract_person_boxes(detection([]), 0, 480)

    def test_mismatched_detection_arrays_fail_instead_of_truncating(self):
        with self.assertRaises(ValueError):
            extract_person_boxes(detection([[1, 1, 2, 2]], scores=[]), 640, 480)

    def test_rejects_pose_model_and_wrong_class_mapping(self):
        model = FakeDetectModel([detection([])])
        model.task = "pose"
        with self.assertRaises(ValueError): YOLOPersonDetector(model)
        model.task, model.names = "detect", {0: "car"}
        with self.assertRaises(ValueError): YOLOPersonDetector(model)

    def test_detect_calls_class_zero_and_separate_thresholds(self):
        model = FakeDetectModel([detection([[1, 2, 100, 200]])])
        person = YOLOPersonDetector(model, confidence=.4, iou=.6)
        self.assertEqual(len(person.detect(np.zeros((480, 640, 3), np.uint8))), 1)
        self.assertEqual(model.calls[0]["classes"], [0])
        self.assertEqual(model.calls[0]["conf"], .4)
        self.assertEqual(model.calls[0]["iou"], .6)
        self.assertNotIn("keypoints", model.calls[0])


class CompositionTests(unittest.TestCase):
    def backend(self, model, refine, **options):
        estimator = SimpleNamespace(refine=refine)
        with patch("pose_backends.yolo_rtmpose.RTMPoseEstimator", return_value=estimator):
            return YOLODetectRTMPoseDetector(model, "local.onnx", **options)

    def test_detect_only_outputs_reach_rtmpose_with_every_person(self):
        model = FakeDetectModel([detection([[10, 20, 110, 220], [300, 20, 400, 220]])])
        seen = []
        def refine(frame, people):
            seen.extend(people)
            return [Candidate(p.index, p.box, standing_pose(), p.confidence) for p in people]
        backend = self.backend(model, refine, recovery=False)
        output = backend._infer(np.zeros((480, 640, 3), np.uint8))
        self.assertEqual(len(output), 2)
        self.assertTrue(all(not hasattr(p, "keypoints") for p in seen))
        np.testing.assert_array_equal(seen[1].box, [300, 20, 400, 220])

    def test_empty_detector_does_not_fabricate_person(self):
        backend = self.backend(FakeDetectModel([detection([])]), lambda frame, people: people)
        packet = backend.detect(np.zeros((480, 640, 3), np.uint8), 0, PoseStream(confidence_threshold=.3))
        self.assertEqual(packet.candidates, [])
        self.assertFalse(packet.recovered)

    def test_crop_recovery_restores_detect_only_box_and_rtm_coordinates(self):
        pose, box = standing_pose(), np.array([170, 20, 470, 460], np.float32)
        stream = PoseStream(confidence_threshold=.3)
        stream.update([Candidate(0, box, pose, .9)], 0, 640, 480)
        region = padded_region(box, 640, 480)
        x1, y1, x2, y2 = region
        poor = pose.copy(); poor[:, [13, 14]] = 0
        local = pose.copy()
        local[:2] = (pose[:2] * [[640], [480]] - [[x1], [y1]]) / [[x2-x1], [y2-y1]]
        model = FakeDetectModel([detection([box]), detection([box-[x1,y1,x1,y1]])])
        def refine(frame, people):
            output = poor if frame.shape[:2] == (480, 640) else local
            return [Candidate(p.index, p.box, output.copy(), p.confidence) for p in people]
        backend = self.backend(model, refine)
        result = backend.detect(np.zeros((480, 640, 3), np.uint8), .03, stream)
        self.assertTrue(result.recovered)
        packet = stream.update(result.candidates, .03, 640, 480)
        self.assertTrue(packet.ready)
        np.testing.assert_allclose(packet.raw, pose, atol=1e-6)
        np.testing.assert_array_equal(packet.selection.candidate.box, box)
        self.assertFalse(packet.inferred.any())

    def test_ambiguity_withholds_target_and_never_recovers_one_person(self):
        pose, box = standing_pose(), np.array([170, 20, 470, 460], np.float32)
        stream = PoseStream(confidence_threshold=.3)
        stream.update([Candidate(0, box, pose, .9)], 0, 640, 480)
        model = FakeDetectModel([detection([box, box])])
        backend = self.backend(model, lambda f, people: [Candidate(p.index,p.box,pose,.9) for p in people])
        result = backend.detect(np.zeros((480, 640, 3), np.uint8), .03, stream)
        self.assertFalse(result.recovery_attempted)
        packet = stream.update(result.candidates, .03, 640, 480)
        self.assertEqual(packet.selection.state, "AMBIGUOUS")
        self.assertFalse(packet.ready)


class ConfigurationTests(unittest.TestCase):
    def fixture(self, root):
        for name in ["pose.pt", "detect.pt", "end2end.onnx", "pipeline.json"]:
            (root/name).touch()
        return PoseBackendConfig(backend="yolo-detect-rtmpose", yolo_pose_model=root/"pose.pt",
                                 person_model=root/"detect.pt", rtmpose_model=root/"end2end.onnx")

    def test_detector_pipeline_does_not_require_yolo_pose_weights(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); config=self.fixture(root)
            (root/"pose.pt").unlink()
            config.validate()
            self.assertEqual(config.confidence_threshold, .3)
            with self.assertRaises(FileNotFoundError): replace(config,backend="yolo").validate()

    def test_no_download_or_model_load_when_a_required_asset_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); config=self.fixture(root)
            (root/"end2end.onnx").unlink()
            with patch("ultralytics.YOLO") as loader, self.assertRaises(FileNotFoundError):
                build_pose_backend(config)
            loader.assert_not_called()

    def test_factory_loads_detection_weights_only_for_new_backend(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); config=self.fixture(root)
            model=FakeDetectModel([detection([])])
            with patch("ultralytics.YOLO", return_value=model) as loader, \
                 patch("pose_backends.yolo_rtmpose.RTMPoseEstimator"):
                result=build_pose_backend(config)
            self.assertIsInstance(result,YOLODetectRTMPoseDetector)
            loader.assert_called_once_with(str((root/"detect.pt").resolve()))

    def test_yolo_baseline_needs_neither_detector_nor_rtmpose_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); config=replace(self.fixture(root),backend="yolo")
            (root/'detect.pt').unlink(); (root/'end2end.onnx').unlink(); (root/'pipeline.json').unlink()
            with patch('ultralytics.YOLO',return_value=SimpleNamespace(task='pose')) as loader:
                backend=build_pose_backend(config)
            self.assertFalse(hasattr(backend,'estimator'))
            self.assertEqual(config.confidence_threshold,.5)
            loader.assert_called_once_with(str((root/'pose.pt').resolve()))

    def test_alias_legacy_backend_and_threshold_validation(self):
        config=PoseBackendConfig(backend="rtmpose")
        self.assertEqual(config.canonical_backend,"yolo-detect-rtmpose")
        self.assertEqual(PoseBackendConfig(backend="yolo-pose-rtmpose").canonical_backend,"yolo-pose-rtmpose")
        for bad in [0,1.1,float('nan'),float('inf')]:
            with self.assertRaises(ValueError): replace(config,min_score=bad).validate()

    def test_shared_cli_handles_custom_models_and_person_threshold(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); self.fixture(root)
            parser=argparse.ArgumentParser();add_pose_arguments(parser)
            args=parser.parse_args(['--pose-backend','rtmpose','--person-model',str(root/'detect.pt'),
                '--rtmpose-model',str(root/'end2end.onnx'),'--person-conf','.4','--pose-min-score','.35'])
            config=config_from_args(args)
            self.assertEqual(config.confidence_threshold,.35)
            self.assertEqual(config.detection_confidence,.4)

    def test_session_metadata_records_actual_detector_and_pose_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); config=self.fixture(root)
            metadata=describe_backend(replace(config,backend="rtmpose"))
            self.assertEqual(metadata['backend'], 'yolo-detect-rtmpose')
            self.assertEqual(set(metadata['assets']), {'yolo_detect','rtmpose','rtmpose_pipeline'})
            self.assertEqual(metadata['assets']['yolo_detect']['sha256'],hashlib.sha256(b'').hexdigest())


class AssetTests(unittest.TestCase):
    def test_offline_detector_install_checks_digest_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);data=b'official model fixture'
            model=root/'source.pt';model.write_bytes(data)
            manifest=root/'manifest.json'
            manifest.write_text(json.dumps({'yolov8n':{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}}))
            with patch.object(fetch_pose_models,'MANIFEST',manifest):
                target=fetch_pose_models.install_detector(root/'weights',model)
                self.assertEqual(target.read_bytes(),data)
                model.write_bytes(b'tampered')
                with self.assertRaises(ValueError): fetch_pose_models.install_detector(root/'weights',model)
                self.assertEqual(target.read_bytes(),data)

    def test_verified_existing_detector_is_reused_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);data=b'cached model';model=root/'yolov8n.pt';model.write_bytes(data)
            manifest=root/'manifest.json';manifest.write_text(json.dumps({'yolov8n':{'sha256':hashlib.sha256(data).hexdigest()}}))
            with patch.object(fetch_pose_models,'MANIFEST',manifest), \
                 patch('urllib.request.urlopen',side_effect=AssertionError('No network expected')):
                self.assertEqual(fetch_pose_models.install_detector(root),model)


if __name__ == '__main__':
    unittest.main()
