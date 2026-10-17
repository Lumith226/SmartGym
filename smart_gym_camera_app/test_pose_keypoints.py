"""Regression checks for masked YOLO joints being mistaken for observations."""

import unittest

import numpy as np

from enhanced_pose_processor import EnhancedPoseProcessor, sanitize_image_keypoints


def standing_pose():
    xy = [[.5, .1], [.48, .09], [.52, .09], [.46, .1], [.54, .1],
          [.4, .25], [.6, .25], [.35, .4], [.65, .4], [.3, .55], [.7, .55],
          [.45, .55], [.55, .55], [.43, .75], [.57, .75], [.41, .95], [.59, .95]]
    return np.vstack([np.asarray(xy, dtype=np.float32).T,
                      np.full((1, 17), .9, dtype=np.float32)])


class MissingKeypointTests(unittest.TestCase):
    def test_masked_coordinate_loses_confidence_without_mutating_input(self):
        pose = standing_pose()
        pose[:, 13] = [0, 0, .45]
        clean = sanitize_image_keypoints(pose)
        np.testing.assert_array_equal(clean[:, 13], [0, 0, 0])
        self.assertAlmostEqual(float(pose[2, 13]), .45, places=6)
        np.testing.assert_array_equal(clean[:, 12], pose[:, 12])

    def test_valid_image_boundary_coordinate_is_preserved(self):
        pose = standing_pose()
        pose[:, 9] = [0, .5, .9]
        np.testing.assert_array_equal(sanitize_image_keypoints(pose), pose)

    def test_nonfinite_values_are_not_sent_to_inference(self):
        pose = standing_pose()
        pose[0, 13] = np.nan
        pose[2, 14] = np.inf
        clean = sanitize_image_keypoints(pose)
        self.assertTrue(np.isfinite(clean).all())
        np.testing.assert_array_equal(clean[:, [13, 14]], np.zeros((3, 2)))

    def test_sequence_and_single_frame_use_same_missing_point_rule(self):
        pose = standing_pose()
        pose[:, 13] = [0, 0, .45]
        sequence = np.repeat(pose[:, None, :], 32, axis=1)
        clean = sanitize_image_keypoints(sequence)
        np.testing.assert_array_equal(clean[:, 0], sanitize_image_keypoints(pose))
        np.testing.assert_array_equal(clean[:, :, 13], np.zeros((3, 32)))

    def test_initial_masked_joint_is_not_rendered_as_observed(self):
        pose = standing_pose()
        pose[:, 13] = [0, 0, .45]
        filtered = EnhancedPoseProcessor("squat").process_frame(pose)
        np.testing.assert_array_equal(filtered[:, 13], [0, 0, 0])

    def test_masked_joint_uses_previous_position_instead_of_pulling_to_origin(self):
        pose = standing_pose()
        processor = EnhancedPoseProcessor("squat")
        previous = processor.process_frame(pose)
        masked = pose.copy()
        masked[:, 13] = [0, 0, .45]
        filtered = processor.process_frame(masked)
        np.testing.assert_allclose(filtered[:2, 13], previous[:2, 13], atol=1e-6)
        self.assertLess(float(filtered[2, 13]), float(previous[2, 13]))


if __name__ == "__main__":
    unittest.main()
