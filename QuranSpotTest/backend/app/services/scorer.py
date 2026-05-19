"""Score a reciter's ASR output against the canonical target text.

**Length-adaptive threshold.**

Pass threshold scales with ayah length so short ayat aren't unfairly
penalised (a single misheard letter on a 10-char ayah is < 10% error —
a tough standard) while long ayat still require real accuracy:

  - short  (< 20 chars)  → 60 % threshold  (40 % allowed error)
  - normal (20–80 chars)  → 70 % threshold  (30 % allowed error)
  - long   (> 80 chars)   → 75 % threshold  (25 % allowed error)

We score with two metrics for telemetry but the pass decision is purely
on char-level Levenshtein over whitespace-stripped strings, which forgives
the Whisper model's tendency to split words (e.g. "الر حيم" for
"الرحيم") while still flagging real letter-level mistakes.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from rapidfuzz.distance import Levenshtein

NO_SPEECH_MIN_CHARS = 4


def _allowed_error_pct(target_length: int) -> int:
    """Allowed error percentage based on target char length."""
    if target_length < 20:
        return 40   # 60% threshold — short ayat
    if target_length <= 80:
        return 30   # 70% threshold — normal ayat
    return 25       # 75% threshold — long ayat


def _max_allowed_distance(target_length: int) -> int:
    """The largest char-edit distance that still counts as a pass."""
    if target_length <= 0:
        return 0
    pct = _allowed_error_pct(target_length)
    return max(1, math.ceil(target_length * pct / 100))


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

    passed = char_dist <= _max_allowed_distance(len(target_chars))
    return RoundScore(
        accuracy=char_acc,
        word_accuracy=word_acc,
        char_accuracy=char_acc,
        passed=passed,
        reason=None,
    )
