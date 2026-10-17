"""Coordinate/color contract and confidence isolation for the optional backend."""

import json
import hashlib
import io
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
import zipfile
from unittest.mock import patch

import numpy as np

from pose_tracking import Candidate, PoseStream
from rtmpose_estimator import RTMPoseEstimator, crop_transform, decode_simcc
from test_pose_keypoints import standing_pose
import fetch_rtmpose


class CoordinateTests(unittest.TestCase):
    def test_affine_preserves_aspect_and_maps_box_center(self):
        transform, center, extent = crop_transform([100, 50, 300, 450], (192, 256))
        np.testing.assert_allclose(transform @ np.r_[center, 1], [96, 128], atol=1e-5)
        self.assertAlmostEqual(float(extent[0] / extent[1]), .75)
        self.assertAlmostEqual(float(transform[0, 0]), float(transform[1, 1]))

    def test_simcc_decode_returns_original_coordinates_and_min_axis_score(self):
        x, y = np.zeros((1, 17, 384), np.float32), np.zeros((1, 17, 512), np.float32)
        x[:, :, 192] = .8
        y[:, :, 256] = .6
        _, center, extent = crop_transform([100, 50, 300, 450], (192, 256))
        points, scores = decode_simcc(x, y, center, extent, (192, 256))
        np.testing.assert_allclose(points, np.tile(center, (17, 1)), atol=1e-5)
        np.testing.assert_allclose(scores, .6)

    def test_missing_response_is_not_translated_to_crop_center(self):
        x, y = np.zeros((1, 17, 384), np.float32), np.zeros((1, 17, 512), np.float32)
        points, scores = decode_simcc(x, y, np.array([200, 250]), np.array([375, 500]), (192, 256))
        self.assertFalse(points.any())
        self.assertFalse(scores.any())

    def test_wholebody_shape_and_nonfinite_response_are_rejected(self):
        with self.assertRaises(ValueError):
            decode_simcc(np.zeros((1, 133, 384)), np.zeros((1, 133, 512)), [0, 0], [1, 1], (192, 256))
        with self.assertRaises(ValueError):
            decode_simcc(np.full((1, 17, 384), np.nan), np.zeros((1, 17, 512)), [0, 0], [1, 1], (192, 256))

    def test_invalid_box_is_not_warped(self):
        for box in [[1, 2, 1, 5], [0, 0, np.inf, 5], [1, 2, 3]]:
            with self.assertRaises(ValueError):
                crop_transform(box, (192, 256))


class BackendTests(unittest.TestCase):
    def test_export_metadata_controls_rgb_and_normalization(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "end2end.onnx").touch()
            pipeline = {"pipeline": {"tasks": [
                {"transforms": [{"type": "TopDownGetBboxCenterScale", "padding": 1.0, "image_size": [6, 8]},
                                {"type": "Normalize", "mean": [1, 2, 3], "std": [1, 2, 1], "to_rgb": True}]},
                {"params": {"type": "SimCCLabel", "use_dark": False, "normalize": False, "simcc_split_ratio": 2.0}}]}}
            (root / "pipeline.json").write_text(json.dumps(pipeline))
            session = SimpleNamespace(get_inputs=lambda: [SimpleNamespace(name="input", shape=["batch", 3, 8, 6])],
                get_outputs=lambda: [SimpleNamespace(name="simcc_x", shape=["batch", "joints", 12]),
                                     SimpleNamespace(name="simcc_y", shape=["batch", "joints", 16])])
            with patch("rtmpose_estimator.ort.InferenceSession", return_value=session):
                estimator = RTMPoseEstimator(root / "end2end.onnx")
            image = np.full((8, 6, 3), [10, 20, 30], dtype=np.uint8)
            tensor, _, _ = estimator.preprocess(image, [0, 0, 6, 8])
            self.assertEqual(tensor.shape, (1, 3, 8, 6))
            np.testing.assert_allclose(tensor[0, :, 4, 3], [29, 9, 7])
            self.assertEqual(tensor.dtype, np.float32)

    def test_refinement_preserves_target_metadata_and_masks_outside_image(self):
        estimator = object.__new__(RTMPoseEstimator)
        points = np.tile([320., 240.], (1, 17, 1))
        points[0, 13] = [-10, 240]
        scores = np.full((1, 17), .7)
        estimator.estimate = lambda frame, boxes: (points, scores)
        original = Candidate(4, np.array([100, 20, 500, 470]), standing_pose(), .85, "roi")
        refined = estimator.refine(np.zeros((480, 640, 3), np.uint8), [original])[0]
        self.assertEqual((refined.index, refined.confidence, refined.source), (4, .85, "roi"))
        np.testing.assert_allclose(refined.keypoints[:, 5], [.5, .5, .7])
        np.testing.assert_array_equal(refined.keypoints[:, 13], 0)
        np.testing.assert_array_equal(original.keypoints, standing_pose())

    def test_empty_detections_do_not_hallucinate_full_frame_person(self):
        estimator = object.__new__(RTMPoseEstimator)
        estimator.session = SimpleNamespace(run=lambda *args: self.fail("Should not infer without detections"))
        self.assertEqual(estimator.refine(np.zeros((480, 640, 3), np.uint8), []), [])

    def test_backend_threshold_is_explicit_and_survives_reset(self):
        pose = standing_pose()
        pose[2] = .4
        candidate = Candidate(0, np.array([100, 20, 450, 470]), pose, .9)
        self.assertFalse(PoseStream().update([candidate], 0, 640, 480).ready)
        stream = PoseStream(confidence_threshold=.3)
        self.assertTrue(stream.update([candidate], 0, 640, 480).ready)
        stream.reset()
        self.assertTrue(stream.update([candidate], 1, 640, 480).ready)
        missing = pose.copy()
        missing[:, [13, 14]] = 0
        packet = stream.update([Candidate(0, candidate.box, missing, .9)], 1.1, 640, 480)
        self.assertTrue(packet.inferred[[13, 14]].all())
        self.assertFalse(packet.ready)
        self.assertFalse(packet.raw[:, packet.inferred].any())


class EvaluationAndAssetTests(unittest.TestCase):
    def asset_fixture(self, root):
        files = {"end2end.onnx": b"fake model for offline checksum contract", "pipeline.json": b"{}"}
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            for name, content in files.items():
                archive.writestr("release/" + name, content)
        content = buffer.getvalue()
        (root / "release.zip").write_bytes(content)
        metadata = {"m": {"url": "https://example.invalid/not-used.zip",
            "archive_bytes": len(content), "archive_sha256": hashlib.sha256(content).hexdigest(),
            "model_sha256": hashlib.sha256(files["end2end.onnx"]).hexdigest(),
            "pipeline_sha256": hashlib.sha256(files["pipeline.json"]).hexdigest()}}
        (root / "rtmpose_models.json").write_text(json.dumps(metadata))
        return files

    def test_offline_install_verifies_archive_and_both_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); files = self.asset_fixture(root)
            with patch.object(fetch_rtmpose, "ROOT", root):
                model = fetch_rtmpose.install("m", root / "assets", root / "release.zip")
            self.assertEqual(model.read_bytes(), files["end2end.onnx"])
            self.assertEqual(model.with_name("pipeline.json").read_bytes(), files["pipeline.json"])

    def test_tampered_release_cannot_install_model(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); self.asset_fixture(root)
            (root / "release.zip").write_bytes(b"tampered")
            with patch.object(fetch_rtmpose, "ROOT", root), self.assertRaises(ValueError):
                fetch_rtmpose.install("m", root / "assets", root / "release.zip")
            self.assertFalse((root / "assets").exists())


if __name__ == "__main__":
    unittest.main()
