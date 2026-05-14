"""Score a reciter's ASR output against the canonical target text.

**Strict mode with a short-ayah floor.**

A round passes when the char-level edit distance is within an allowance
that is the **larger of** two limits:
  - the percentage limit: `ceil(target_length * (1 - PASS_THRESHOLD))`
  - the absolute floor: `MIN_ALLOWED_CHAR_ERRORS`

The floor exists because a strict percentage threshold over-penalizes
short ayat — on a 12-char ayah a single ASR slip drops you below 92%,
which would unfairly flag the reciter. The floor absorbs one such slip
on any ayah; longer ayat get more headroom proportional to their size,
which is what the percentage limit provides.

We score with two metrics for telemetry but make the pass decision purely
on char-level Levenshtein over whitespace-stripped strings, which forgives
the Tarteel-Whisper model's tendency to split words (e.g. "الر حيم" for
"الرحيم") while still flagging every real letter-level mistake.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from rapidfuzz.distance import Levenshtein

# 95% baseline: a real mistake (a substituted word is ~5–10 chars on a
# typical-length ayah) always fails. ASR noise from the upgraded large-v3
# Tarteel fine-tune (~2–3% WER) typically falls inside this margin on
# medium/long ayat.
# We store as integer percent to avoid floating-point rounding bugs in the
# allowance calculation (1.0 - 0.95 yields 0.05000…044 in floats, which
# ceils wrong at certain lengths).
PASS_THRESHOLD_PCT = 95
ALLOWED_ERROR_PCT = 100 - PASS_THRESHOLD_PCT
PASS_THRESHOLD = PASS_THRESHOLD_PCT / 100  # for external readers
# Floor for very short ayat — without it, a 1-char ASR glitch on a 10-char
# ayah would fail strict-95%. Setting this to 1 absorbs a single character
# of ASR drift on any-length ayah; raise to 2 if false positives persist.
MIN_ALLOWED_CHAR_ERRORS = 1
NO_SPEECH_MIN_CHARS = 4


def _max_allowed_distance(target_length: int) -> int:
    """The largest char-edit distance that still counts as a pass."""
    if target_length <= 0:
        return 0
    # Integer ceiling division — no float drift.
    proportional = math.ceil(target_length * ALLOWED_ERROR_PCT / 100)
    return max(MIN_ALLOWED_CHAR_ERRORS, proportional)


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

    # Strict pass: char-distance within the larger of (5% margin, 1-char floor).
    # The floor is what makes short ayat fair — a single ASR slip can't tank
    # an 8-char ayah's score below 90% under this rule.
    passed = char_dist <= _max_allowed_distance(len(target_chars))
    return RoundScore(
        accuracy=char_acc,
        word_accuracy=word_acc,
        char_accuracy=char_acc,
        passed=passed,
        reason=None,
    )
