"""Score a reciter's ASR output against the canonical target text.

We compute two accuracies and take the better one:
  - **Word-level**: standard token Levenshtein over the target words.
  - **Char-level** on the joined strings: forgives mid-word splits (e.g.
    the ASR producing "الر حيم" when the canonical is "الرحيم"). This is
    the dominant Tarteel-Whisper failure mode observed in practice.

A round "passes" when accuracy >= PASS_THRESHOLD (0.70). Empty or near-empty
ASR output short-circuits to `no_speech`.
"""

from __future__ import annotations

from dataclasses import dataclass

from rapidfuzz.distance import Levenshtein

PASS_THRESHOLD = 0.70
NO_SPEECH_MIN_CHARS = 4


@dataclass
class RoundScore:
    accuracy: float
    word_accuracy: float
    char_accuracy: float
    passed: bool
    reason: str | None  # "no_speech" when we short-circuited, else None

    def to_dict(self) -> dict:
        return {
            "accuracy": round(self.accuracy, 4),
            "word_accuracy": round(self.word_accuracy, 4),
            "char_accuracy": round(self.char_accuracy, 4),
            "passed": self.passed,
            "reason": self.reason,
        }


def score_round(target_words: list[str], asr_words: list[str]) -> RoundScore:
    if not target_words:
        # Defensive: empty target means we built nothing — caller bug.
        return RoundScore(0.0, 0.0, 0.0, False, "empty_target")

    asr_joined_chars = "".join(asr_words)
    if len(asr_joined_chars) < NO_SPEECH_MIN_CHARS:
        return RoundScore(0.0, 0.0, 0.0, False, "no_speech")

    # Truncate the ASR to exactly the target's length (word- and char-wise).
    # This discards any trailing hallucination: a reciter who finished correctly
    # and kept rambling shouldn't lose points, but a reciter who only said the
    # first half *does* lose points (the second half becomes insertions).
    asr_word_trim = asr_words[: len(target_words)]
    word_dist = Levenshtein.distance(target_words, asr_word_trim)
    word_acc = max(0.0, 1.0 - word_dist / max(1, len(target_words)))

    target_chars = "".join(target_words)
    asr_chars = "".join(asr_words)[: len(target_chars)]
    char_dist = Levenshtein.distance(target_chars, asr_chars)
    char_acc = max(0.0, 1.0 - char_dist / max(1, len(target_chars)))

    accuracy = max(word_acc, char_acc)
    return RoundScore(
        accuracy=accuracy,
        word_accuracy=word_acc,
        char_accuracy=char_acc,
        passed=accuracy >= PASS_THRESHOLD,
        reason=None,
    )
