"""Tracking continuity and missing-observation safety regression tests."""

from types import SimpleNamespace
import unittest

import numpy as np

from pose_tracking import (Candidate, PersonSelector, PoseStream, StablePoseFilter,
                           extract_candidates, frame_quality)
from rep_tracker import ExerciseRepTracker
from test_pose_keypoints import standing_pose


def person(index=0, box=(100, 20, 450, 470), offset=0):
    pose = standing_pose()
    pose[0] += offset
    return Candidate(index, np.array(box, dtype=np.float32), pose, 0.9)


class PersonAssociationTests(unittest.TestCase):
    def test_detection_order_change_keeps_target(self):
        selector = PersonSelector()
        a, b = person(), person(1, (500, 20, 630, 470))
        first = selector.update([a, b], 0)
        second = selector.update([b, a], .03)
        self.assertIs(second.candidate, a)
        self.assertEqual(first.track_id, second.track_id)
        self.assertFalse(second.reset_history)

    def test_distant_bystander_is_not_used_when_target_disappears(self):
        selector = PersonSelector()
        selector.update([person(box=(20, 20, 150, 450))], 0)
        missing = selector.update([person(1, (450, 20, 630, 450))], .1)
        self.assertIsNone(missing.candidate)
        self.assertEqual(missing.state, "TARGET_LOST")

    def test_ambiguous_match_is_withheld(self):
        selector = PersonSelector()
        selector.update([person()], 0)
        ambiguous = selector.update([person(box=(99, 20, 449, 470)),
                                     person(1, (101, 20, 451, 470))], .03)
        self.assertEqual(ambiguous.state, "AMBIGUOUS")
        self.assertIsNone(ambiguous.candidate)

    def test_history_expires_before_person_lock(self):
        selector = PersonSelector()
        first = selector.update([person()], 0)
        self.assertFalse(selector.update([], .1).reset_history)
        lost = selector.update([], .3)
        self.assertTrue(lost.reset_history)
        self.assertEqual(first.track_id, lost.track_id)
        self.assertFalse(selector.update([], .4).reset_history)

    def test_timeout_requires_explicit_selection_before_new_identity(self):
        selector = PersonSelector()
        first = selector.update([person()], 0)
        second = selector.update([person(1, (450, 20, 630, 450))], 1.1)
        self.assertIsNone(second.candidate)
        self.assertEqual(second.state, "RESELECT_REQUIRED")
        self.assertTrue(second.reset_history)
        self.assertIsNone(selector.update([person()], 1.2).candidate)
        selector.select_at(500, 200)
        selected = selector.update([person(1, (450, 20, 630, 450))], 1.3)
        self.assertIsNotNone(selected.candidate)
        self.assertNotEqual(first.track_id, selected.track_id)

    def test_pose_continuity_disambiguates_overlapping_boxes(self):
        selector = PersonSelector()
        selector.update([person()], 0, (640, 480))
        target, bystander = person(), person(1, offset=.3)
        chosen = selector.update([bystander, target], .03, (640, 480))
        self.assertIs(chosen.candidate, target)

    def test_overlapping_click_is_withheld(self):
        selector = PersonSelector()
        selector.select_at(200, 200)
        self.assertEqual(selector.update([person(), person(1)], 0).state, "AMBIGUOUS")

    def test_large_pose_change_with_strong_box_overlap_is_not_identity_loss(self):
        selector = PersonSelector()
        initial = person()
        initial.keypoints[0] *= .35
        selector.update([initial], 0, (640, 480))
        moved = person()
        moved.keypoints[0] = moved.keypoints[0] * .35 + .5
        self.assertIs(selector.update([moved], .03, (640, 480)).candidate, moved)

    def test_expired_empty_stream_resets_only_once(self):
        selector = PersonSelector()
        selector.update([person()], 0)
        self.assertTrue(selector.update([], 1.1).reset_history)
        self.assertFalse(selector.update([], 1.2).reset_history)

    def test_click_selects_requested_person(self):
        selector = PersonSelector()
        a, b = person(), person(1, (500, 20, 630, 470))
        selector.select_at(550, 200)
        self.assertIs(selector.update([a, b], 0).candidate, b)

    def test_click_outside_people_does_not_silently_select_another(self):
        selector = PersonSelector()
        selector.select_at(10, 10)
        self.assertIsNone(selector.update([person()], 0).candidate)

    def test_weak_skeleton_is_not_acquired(self):
        weak = person()
        weak.keypoints[:, 4:] = 0
        self.assertIsNone(PersonSelector().update([weak], 0).candidate)

    def test_time_reversal_does_not_reuse_old_identity(self):
        selector = PersonSelector()
        first = selector.update([person()], 2)
        second = selector.update([person()], 0)
        self.assertTrue(second.reset_history)
        self.assertNotEqual(first.track_id, second.track_id)


class TemporalPoseTests(unittest.TestCase):
    def test_missing_joint_is_display_only_and_expires(self):
        filt = StablePoseFilter()
        pose = standing_pose()
        filt.update(pose, 0, 640, 480)
        missing = pose.copy()
        missing[:, 13] = 0
        display, observed, inferred = filt.update(missing, .1, 640, 480)
        self.assertFalse(observed[13])
        self.assertTrue(inferred[13])
        self.assertEqual(float(display[2, 13]), np.float32(.2))
        display, observed, inferred = filt.update(missing, .2, 640, 480)
        self.assertFalse(inferred[13])
        np.testing.assert_array_equal(display[:, 13], [0, 0, 0])

    def test_inference_never_refreshes_observation_timestamp(self):
        filt = StablePoseFilter()
        filt.update(standing_pose(), 0, 640, 480)
        for timestamp in [.04, .08, .12]:
            filt.update(np.zeros((3, 17)), timestamp, 640, 480)
        display, _, inferred = filt.update(np.zeros((3, 17)), .16, 640, 480)
        self.assertFalse(inferred.any())
        self.assertFalse(display.any())

    def test_observation_after_long_gap_snaps_to_new_position(self):
        filt = StablePoseFilter()
        pose = standing_pose()
        filt.update(pose, 0, 640, 480)
        moved = pose.copy()
        moved[0] += .1
        display, _, inferred = filt.update(moved, .5, 640, 480)
        np.testing.assert_allclose(display, moved, atol=1e-6)
        self.assertFalse(inferred.any())

    def test_smoothing_uses_elapsed_time(self):
        pose = standing_pose()
        moved = pose.copy()
        moved[0] += 3 / 640
        a, b = StablePoseFilter(), StablePoseFilter()
        a.update(pose, 0, 640, 480)
        b.update(pose, 0, 640, 480)
        for t in [1 / 30, 2 / 30]:
            result_a, _, _ = a.update(moved, t, 640, 480)
        for t in [1 / 60, 2 / 60, 3 / 60, 4 / 60]:
            result_b, _, _ = b.update(moved, t, 640, 480)
        np.testing.assert_allclose(result_a[:2], result_b[:2], atol=1 / 640)

    def test_stationary_noise_is_reduced_without_inventing_observations(self):
        filt = StablePoseFilter()
        pose = standing_pose()
        values = []
        for i in range(90):
            noisy = pose.copy()
            noisy[0, 9] += (3 if i % 2 else -3) / 640
            display, observed, inferred = filt.update(noisy, i / 30, 640, 480)
            self.assertTrue(observed.all())
            self.assertFalse(inferred.any())
            values.append((display[0, 9] - pose[0, 9]) * 640)
        self.assertLess(float(np.std(values[10:])), 1.5)

    def test_duplicate_timestamp_does_not_freeze_new_observation(self):
        filt = StablePoseFilter()
        filt.update(standing_pose(), 1, 640, 480)
        moved = standing_pose()
        moved[0, 9] += .01
        result, _, _ = filt.update(moved, 1, 640, 480)
        np.testing.assert_allclose(result, moved)

    def test_fast_continuous_motion_remains_observed_with_bounded_lag(self):
        filt = StablePoseFilter()
        pose = standing_pose()
        for i in range(30):
            moving = pose.copy()
            moving[0, 9] += i * .01
            display, observed, _ = filt.update(moving, i / 30, 640, 480)
            self.assertTrue(observed[9])
        self.assertLess(abs(float(display[0, 9] - moving[0, 9])) * 640, 10)

    def test_extreme_weak_jump_is_withheld_but_strong_motion_is_kept(self):
        filt = StablePoseFilter()
        pose = standing_pose()
        filt.update(pose, 0, 640, 480)
        moved = pose.copy()
        moved[0, 9] = .9
        moved[2, 9] = .6
        _, observed, inferred = filt.update(moved, .03, 640, 480)
        self.assertFalse(observed[9])
        self.assertTrue(inferred[9])
        moved[2, 9] = .9
        display, observed, _ = filt.update(moved, .06, 640, 480)
        self.assertTrue(observed[9])
        self.assertGreater(float(display[0, 9]), .8)


class StreamIntegrationTests(unittest.TestCase):
    def test_pushup_requires_both_arms_without_requiring_invisible_feet(self):
        observed = np.ones(17, dtype=bool)
        observed[[15, 16]] = False
        self.assertTrue(frame_quality(observed, "push_up"))
        observed[7] = False
        self.assertFalse(frame_quality(observed, "push_up"))

    def test_crunch_requires_both_sides_used_by_midpoint_angles(self):
        observed = np.ones(17, dtype=bool)
        observed[13] = False
        self.assertFalse(frame_quality(observed, "crunch"))

    def test_inferred_knees_cannot_qualify_squat(self):
        stream = PoseStream("squat")
        self.assertTrue(stream.update([person()], 0, 640, 480).ready)
        missing = person()
        missing.keypoints[:, [13, 14]] = 0
        packet = stream.update([missing], .1, 640, 480)
        self.assertTrue(packet.inferred[[13, 14]].all())
        self.assertFalse(packet.ready)
        self.assertFalse(packet.analysis[:, [13, 14]].any())
        self.assertFalse(packet.raw[:, [13, 14]].any())

    def test_new_target_clears_filter_history(self):
        stream = PoseStream()
        stream.update([person()], 0, 640, 480)
        replacement = person(1, (450, 20, 630, 470), offset=.1)
        stream.select_at(500, 200)
        packet = stream.update([replacement], 1.2, 640, 480)
        self.assertTrue(packet.reset_history)
        np.testing.assert_allclose(packet.display, replacement.keypoints, atol=1e-6)

    def test_poor_pose_for_long_gap_interrupts_rep_history(self):
        stream = PoseStream()
        stream.update([person()], 0, 640, 480)
        poor = person()
        poor.keypoints[:, [13, 14, 15, 16]] = 0
        self.assertFalse(stream.update([poor], .1, 640, 480).reset_history)
        self.assertTrue(stream.update([poor], .3, 640, 480).reset_history)

    def test_frame_size_change_starts_new_track(self):
        stream = PoseStream()
        first = stream.update([person()], 0, 640, 480)
        second = stream.update([person()], .03, 1280, 720)
        self.assertTrue(second.reset_history)
        self.assertNotEqual(first.selection.track_id, second.selection.track_id)

    def test_rep_reset_preserves_completed_count(self):
        tracker = ExerciseRepTracker(SimpleNamespace())
        tracker.rep_count = 4
        tracker.current_rep_frames = [standing_pose()]
        tracker.pre_buffer.append(standing_pose())
        tracker.last_result = {"class_code": "CORRECT"}
        tracker.reset_motion()
        self.assertEqual(tracker.rep_count, 4)
        self.assertFalse(tracker.current_rep_frames)
        self.assertFalse(tracker.pre_buffer)
        self.assertIsNone(tracker.last_result)

    def test_prefiltered_path_preserves_raw_model_input(self):
        tracker = ExerciseRepTracker(SimpleNamespace())
        def fail_if_called(_):
            raise AssertionError("online pose was filtered a second time")
        tracker.smooth_kpts = fail_if_called
        model_input = standing_pose()
        model_input[0, 9] += .02
        tracker.process_frame(standing_pose(), prefiltered=True, model_keypoints=model_input)
        np.testing.assert_array_equal(tracker.pre_buffer[-1], model_input)

    def test_empty_pose_result_is_safe(self):
        result = SimpleNamespace(keypoints=SimpleNamespace(data=np.zeros((1, 0, 51))),
                                 boxes=SimpleNamespace(xyxy=np.empty((0, 4)), conf=np.empty(0)))
        self.assertEqual(extract_candidates(result, 640, 480), [])

    def test_detector_adapter_sanitizes_all_people(self):
        pose = standing_pose().T.copy()
        pose[:, :2] *= [640, 480]
        pose[13] = [0, 0, .45]
        result = SimpleNamespace(keypoints=SimpleNamespace(data=np.array([pose, pose])),
            boxes=SimpleNamespace(xyxy=np.array([[100, 20, 450, 470], [120, 20, 470, 470]]),
                                  conf=np.array([.9, .8])))
        candidates = extract_candidates(result, 640, 480)
        self.assertEqual(len(candidates), 2)
        for candidate in candidates:
            np.testing.assert_array_equal(candidate.keypoints[:, 13], [0, 0, 0])

    def test_malformed_boxes_and_nonfinite_scores_are_rejected(self):
        points = np.repeat(standing_pose().T[None], 2, axis=0)
        result = SimpleNamespace(keypoints=SimpleNamespace(data=points),
            boxes=SimpleNamespace(xyxy=np.zeros((2, 3)), conf=np.ones(2)))
        self.assertEqual(extract_candidates(result, 640, 480), [])
        result.boxes.xyxy = np.array([[0, 0, 640, 480]] * 2)
        result.boxes.conf = np.array([np.nan, np.inf])
        self.assertEqual(extract_candidates(result, 640, 480), [])
        result.boxes.xyxy = np.array([[0, 0, np.inf, 480]] * 2)
        result.boxes.conf = np.ones(2)
        self.assertEqual(extract_candidates(result, 640, 480), [])

    def test_invalid_time_or_dimensions_cannot_poison_stream(self):
        stream = PoseStream()
        for timestamp, width, height in [(np.nan, 640, 480), (np.inf, 640, 480), (0, 0, 480)]:
            with self.assertRaises(ValueError):
                stream.update([person()], timestamp, width, height)
        self.assertTrue(stream.update([person()], 0, 640, 480).ready)


if __name__ == "__main__":
    unittest.main()
