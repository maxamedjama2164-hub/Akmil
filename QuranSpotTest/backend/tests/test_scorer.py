from app.services.normalizer import normalize
from app.services.scorer import (
    MIN_ALLOWED_CHAR_ERRORS,
    PASS_THRESHOLD,
    _max_allowed_distance,
    score_round,
)


def _tokens(s: str) -> list[str]:
    return normalize(s)


def test_exact_match_is_perfect_and_passes():
    target = _tokens("بسم الله الرحمن الرحيم")
    result = score_round(target, target)
    assert result.accuracy == 1.0
    assert result.passed is True
    assert result.reason is None


def test_single_word_swap_now_fails_under_strict_mode():
    # Used to "pass with 70%+"; strict mode flags any substantive mistake.
    target = _tokens("بسم الله الرحمن الرحيم")
    asr = _tokens("بسم الله الرحمن النعيم")  # last word substantively wrong
    result = score_round(target, asr)
    assert result.passed is False
    assert result.accuracy < PASS_THRESHOLD


def test_short_ayah_one_char_slip_is_forgiven():
    # The floor protects short ayat. Without it, this would fail under 95%
    # (e.g. 13 chars, 1 char distance = 92.3% < 95%).
    target = _tokens("بسم الله الرحمن")
    asr = _tokens("بسم اله الرحمن")  # one ل dropped from الله
    result = score_round(target, asr)
    assert result.passed is True
    # Confirm we'd have failed strict 95% without the floor.
    assert result.char_accuracy < PASS_THRESHOLD


def test_short_ayah_two_char_mistake_fails():
    # Two-char delta on a small ayah exceeds even the floor.
    target = _tokens("والفجر")  # 6 chars normalized
    asr = ["والشعر"]  # 2 substitutions: ف→ش, ج→ع
    result = score_round(target, asr)
    assert result.passed is False


def test_max_allowed_distance_scales_with_length():
    # Floor dominates for short ayat.
    assert _max_allowed_distance(1) == MIN_ALLOWED_CHAR_ERRORS
    assert _max_allowed_distance(13) == MIN_ALLOWED_CHAR_ERRORS  # 13*0.05 = 0.65 → 1
    # Percentage dominates beyond ~20 chars.
    assert _max_allowed_distance(40) == 2
    assert _max_allowed_distance(100) == 5
    assert _max_allowed_distance(200) == 10


def test_half_recitation_fails():
    target = _tokens("الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين")
    asr = _tokens("الحمد لله رب العالمين")  # only first 4 of 8 words
    result = score_round(target, asr)
    assert result.accuracy < PASS_THRESHOLD
    assert result.passed is False


def test_word_split_is_forgiven_by_char_level():
    # Mirrors what we saw on 1:3: ASR split "الرحيم" into "الر حيم"
    # Char-level is identical (whitespace stripped) so this still passes.
    target = _tokens("الرحمن الرحيم")
    asr = ["الرحمن", "الر", "حيم"]
    result = score_round(target, asr)
    assert result.char_accuracy == 1.0
    assert result.passed is True


def test_trailing_hallucination_is_truncated():
    target = _tokens("بسم الله الرحمن الرحيم")
    asr = target + _tokens("الحمد لله الحمد لله الحمد لله الحمد لله الحمد لله")
    result = score_round(target, asr)
    assert result.passed is True
    assert result.accuracy >= 0.95


def test_no_speech_short_circuits():
    target = _tokens("بسم الله الرحمن الرحيم")
    result = score_round(target, [])
    assert result.passed is False
    assert result.reason == "no_speech"
    assert result.accuracy == 0.0


def test_completely_wrong_text_fails():
    target = _tokens("بسم الله الرحمن الرحيم")
    asr = _tokens("قل هو الله احد الله الصمد")  # different ayah entirely
    result = score_round(target, asr)
    assert result.accuracy < PASS_THRESHOLD
    assert result.passed is False


def test_empty_target_is_caller_error():
    result = score_round([], _tokens("بسم الله"))
    assert result.passed is False
    assert result.reason == "empty_target"
