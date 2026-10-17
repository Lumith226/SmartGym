"""Recovery must preserve image geometry and must not bypass identity gates."""

from types import SimpleNamespace
import unittest

import numpy as np

from pose_detector import PoseDetector, padded_region, restore_crop_candidates
from pose_tracking import Candidate, PoseStream
from test_pose_keypoints import standing_pose


def result_for(pose, box, size):
    points = pose.T.copy()
    points[:, :2] *= size
    return SimpleNamespace(keypoints=SimpleNamespace(data=points[None]),
        boxes=SimpleNamespace(xyxy=np.array([box]), conf=np.array([.9])))


class RecoveryTests(unittest.TestCase):
    def test_crop_round_trip_keeps_missing_joints_missing(self):
        region = (100, 50, 500, 450)
        original = standing_pose()
        original[:, 13] = 0
        local = original.copy()
        valid = local[2] > 0
        local[:2, valid] = ((local[:2] * [[640], [480]] - [[100], [50]]) / 400)[:, valid]
        # Limit this fixture to joints contained in the crop.
        local[:, ((local[:2] < .01) | (local[:2] > .99)).any(axis=0)] = 0
        mapped = restore_crop_candidates([Candidate(0, np.array([0, 0, 400, 400]), local, .9)],
                                         region, 640, 480)[0]
        visible = mapped.keypoints[2] > 0
        np.testing.assert_allclose(mapped.keypoints[:, visible], original[:, visible], atol=1e-6)
        np.testing.assert_array_equal(mapped.keypoints[:, 13], 0)
        np.testing.assert_array_equal(mapped.box, region)
        self.assertEqual(mapped.source, "roi")

    def test_internal_crop_edge_is_not_an_observation(self):
        pose = standing_pose()
        pose[:, 9] = [0, .5, .9]
        mapped = restore_crop_candidates([Candidate(0, np.array([0, 0, 200, 200]), pose, .9)],
                                         (100, 100, 300, 300), 640, 480)[0]
        self.assertFalse(mapped.keypoints[:, 9].any())

    def test_padding_clips_to_image_without_distorting_dimensions(self):
        self.assertEqual(padded_region(np.array([0, 0, 100, 100]), 640, 480), (0, 0, 130, 130))

    def fixture(self, shifted=False):
        width, height = 640, 480
        pose = standing_pose()
        box = np.array([170, 20, 470, 460], dtype=np.float32)
        stream = PoseStream()
        stream.update([Candidate(0, box, pose, .9)], 0, width, height)
        poor = pose.copy()
        poor[:, [13, 14]] = 0
        region = padded_region(box, width, height)
        x1, y1, x2, y2 = region
        crop_pose = pose.copy()
        crop_pose[:2] = ((pose[:2] * [[width], [height]] - [[x1], [y1]])
                         / [[x2 - x1], [y2 - y1]])
        if shifted:
            crop_pose[0] += .3
        crop_box = box - [x1, y1, x1, y1]
        outputs = [result_for(poor, box, (width, height)),
                   result_for(crop_pose, crop_box, (x2 - x1, y2 - y1))]
        calls = []
        def model(frame, **kwargs):
            calls.append(frame.shape)
            return [outputs[min(len(calls) - 1, 1)]]
        return stream, PoseDetector(model), calls

    def test_consistent_recovery_supplies_real_observations(self):
        stream, detector, calls = self.fixture()
        detection = detector.detect(np.zeros((480, 640, 3), np.uint8), .03, stream)
        self.assertTrue(detection.recovery_attempted)
        self.assertTrue(detection.recovered)
        packet = stream.update(detection.candidates, .03, 640, 480)
        self.assertTrue(packet.ready)
        self.assertFalse(packet.inferred.any())
        np.testing.assert_allclose(packet.raw, standing_pose(), atol=1e-6)
        self.assertEqual(len(calls), 2)

    def test_disagreeing_recovery_is_rejected(self):
        stream, detector, _ = self.fixture(shifted=True)
        detection = detector.detect(np.zeros((480, 640, 3), np.uint8), .03, stream)
        self.assertFalse(detection.recovered)
        self.assertFalse(stream.update(detection.candidates, .03, 640, 480).ready)

    def test_retries_are_rate_limited_and_stale_crop_is_not_used(self):
        stream, detector, calls = self.fixture()
        image = np.zeros((480, 640, 3), np.uint8)
        detector.detect(image, .03, stream)
        detector.detect(image, .04, stream)
        self.assertEqual(len(calls), 3)
        before = len(calls)
        detector.detect(image, .7, stream)
        self.assertEqual(len(calls), before + 1)

    def test_expired_target_never_triggers_crop_recovery(self):
        stream, detector, calls = self.fixture()
        stream.update([], 1.1, 640, 480)
        detection = detector.detect(np.zeros((480, 640, 3), np.uint8), 1.2, stream)
        self.assertFalse(detection.recovery_attempted)
        self.assertEqual(len(calls), 1)

    def test_ambiguous_full_frame_never_retries_one_of_the_people(self):
        stream, detector, _ = self.fixture()
        full = detector.model(np.zeros((480, 640, 3)), verbose=False)[0]
        full.keypoints.data = np.repeat(full.keypoints.data, 2, axis=0)
        full.boxes.xyxy = np.repeat(full.boxes.xyxy, 2, axis=0)
        full.boxes.conf = np.array([.9, .9])
        calls = []
        def model(frame, **kwargs):
            calls.append(frame.shape)
            return [full]
        detector.model = model
        detection = detector.detect(np.zeros((480, 640, 3), np.uint8), .03, stream)
        self.assertFalse(detection.recovery_attempted)
        self.assertEqual(len(calls), 1)
        packet = stream.update(detection.candidates, .03, 640, 480)
        self.assertEqual(packet.selection.state, "AMBIGUOUS")
        self.assertFalse(packet.ready)

    def test_frame_size_change_cannot_reuse_previous_crop(self):
        stream, detector, calls = self.fixture()
        detection = detector.detect(np.zeros((720, 1280, 3), np.uint8), .03, stream)
        self.assertFalse(detection.recovery_attempted)
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
