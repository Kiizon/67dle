"""Unit tests for the scoring and daily-word logic.

Run from backend/: .venv/bin/python -m unittest -v
"""
import unittest

from main import WORDS_SET, get_daily_word, score_guess


class ScoreGuessTest(unittest.TestCase):
    def test_exact_match(self):
        self.assertEqual(score_guess("BUTTER", "BUTTER"), ["correct"] * 6)

    def test_no_shared_letters(self):
        self.assertEqual(score_guess("ABCDEF", "GHIJKL"), ["absent"] * 6)

    def test_present_in_wrong_position(self):
        self.assertEqual(
            score_guess("SERVER", "RESTED"),
            ["present", "correct", "present", "absent", "correct", "absent"],
        )

    def test_repeated_guess_letter_only_marked_as_often_as_in_target(self):
        # Target has one T; the green T consumes it, so the other T is absent.
        self.assertEqual(
            score_guess("BUTTER", "BUSTED"),
            ["correct", "correct", "absent", "correct", "correct", "absent"],
        )

    def test_green_takes_priority_over_earlier_yellow(self):
        # Target has one E at index 5. The E at index 1 must not steal it.
        self.assertEqual(
            score_guess("BETTEE", "SIMPLE"),
            ["absent", "absent", "absent", "absent", "absent", "correct"],
        )


class DailyWordTest(unittest.TestCase):
    def test_daily_word_is_stable_and_valid(self):
        word = get_daily_word()
        self.assertEqual(word, get_daily_word())
        self.assertIn(word, WORDS_SET)


if __name__ == "__main__":
    unittest.main()
