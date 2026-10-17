import csv
from pathlib import Path
import tempfile
import unittest

from evaluate_pose_annotations import evaluate


class AnnotationEvaluationTests(unittest.TestCase):
    def write_rows(self, root, missing=False, unlabeled=False, inferred=False):
        rows = []
        for joint, x, y in [("left_shoulder", 100, 100), ("left_hip", 100, 200),
                             ("left_wrist", 150, 100)]:
            row = dict(source_image="image.jpg", frame_index=0, joint=joint,
                       ground_truth_x_px="" if unlabeled else x,
                       ground_truth_y_px="" if unlabeled else y, visibility="visible",
                       raw_x_px=x, raw_y_px=y, raw_conf=.9,
                       filtered_x_px=x, filtered_y_px=y, filtered_conf=.9, inferred=False)
            if joint == "left_wrist":
                row.update(raw_x_px=x + 15, filtered_x_px=x + 5)
                if missing:
                    row.update(raw_x_px=0, raw_y_px=0, raw_conf=0)
                row["inferred"] = inferred
            rows.append(row)
        path = Path(root) / "annotations.csv"
        with path.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        return path

    def test_pixel_distance_is_normalized_by_manual_torso(self):
        with tempfile.TemporaryDirectory() as root:
            report = evaluate([self.write_rows(root)])
        self.assertAlmostEqual(report["raw"]["pck"], 2 / 3)
        self.assertEqual(report["filtered"]["pck"], 1)

    def test_missing_prediction_stays_in_denominator(self):
        with tempfile.TemporaryDirectory() as root:
            report = evaluate([self.write_rows(root, missing=True)])
        self.assertEqual(report["raw"]["ground_truth_joints"], 3)
        self.assertAlmostEqual(report["raw"]["coverage"], 2 / 3)
        self.assertAlmostEqual(report["raw"]["pck"], 2 / 3)

    def test_inferred_prediction_does_not_count_as_observed(self):
        with tempfile.TemporaryDirectory() as root:
            report = evaluate([self.write_rows(root, inferred=True)])
        self.assertAlmostEqual(report["filtered"]["coverage"], 2 / 3)
        self.assertAlmostEqual(report["filtered"]["pck"], 2 / 3)

    def test_extra_wrong_prediction_increases_coverage_but_not_accuracy(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.write_rows(root, missing=True)
            before = evaluate([path])["raw"]
            with path.open(newline="") as handle:
                rows = list(csv.DictReader(handle))
            rows[-1].update(raw_x_px=300, raw_y_px=300, raw_conf=.9)
            with path.open("w", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            after = evaluate([path])["raw"]
        self.assertGreater(after["coverage"], before["coverage"])
        self.assertEqual(after["pck"], before["pck"])

    def test_no_ground_truth_does_not_produce_accuracy(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(ValueError, "No visible"):
                evaluate([self.write_rows(root, unlabeled=True)])

    def test_invalid_threshold_is_rejected(self):
        with self.assertRaises(ValueError):
            evaluate([], threshold=-1)


if __name__ == "__main__":
    unittest.main()
