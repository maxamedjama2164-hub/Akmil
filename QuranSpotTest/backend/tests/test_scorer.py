from app.services.normalizer import normalize
from app.services.scorer import PASS_THRESHOLD, score_round


def _tokens(s: str) -> list[str]:
    return normalize(s)


def test_exact_match_is_perfect_and_passes():
    target = _tokens("بسم الله الرحمن الرحيم")
    result = score_round(target, target)
    assert result.accuracy == 1.0
    assert result.passed is True
    assert result.reason is None


def test_single_word_swap_still_passes():
    target = _tokens("بسم الله الرحمن الرحيم")
    asr = _tokens("بسم الله الرحمن النعيم")  # last word slightly off
    result = score_round(target, asr)
    assert 0.7 < result.accuracy < 1.0
    assert result.passed is True


def test_half_recitation_fails():
    target = _tokens("الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين")
    asr = _tokens("الحمد لله رب العالمين")  # only first 4 of 8 words
    result = score_round(target, asr)
    assert result.accuracy < PASS_THRESHOLD
    assert result.passed is False


def test_word_split_is_forgiven_by_char_level():
    # Mirrors what we saw on 1:3: ASR split "الرحيم" into "الر حيم"
    target = _tokens("الرحمن الرحيم")
    asr = ["الرحمن", "الر", "حيم"]
    result = score_round(target, asr)
    # word-level would dock this hard; char-level near-perfect
    assert result.char_accuracy > result.word_accuracy
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
