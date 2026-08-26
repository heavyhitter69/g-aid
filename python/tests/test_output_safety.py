import os
import tempfile
import unittest

from science.artifacts import assert_gaid_output_path, task_dir


class OutputSafetyTests(unittest.TestCase):
    def test_assert_gaid_output_path_allows_output_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = os.path.join(tmp, "G-AID Output", "runs", "r1")
            os.makedirs(dest)
            self.assertEqual(assert_gaid_output_path(dest), os.path.abspath(dest))

    def test_assert_gaid_output_path_blocks_survey_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, "DAY 1", "rover.csv")
            os.makedirs(os.path.dirname(src))
            with open(src, "w", encoding="utf-8") as handle:
                handle.write("latitude,longitude,mag\n")
            with self.assertRaisesRegex(ValueError, "G-AID Output"):
                assert_gaid_output_path(src)

    def test_task_dir_refuses_source_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            payload = {"parameters": {"outDir": tmp, "taskFolder": "DAY 1"}}
            with self.assertRaisesRegex(ValueError, "G-AID Output"):
                task_dir(payload)


if __name__ == "__main__":
    unittest.main()
