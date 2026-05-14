from app.services.tiers import (
    ALL_TIER_LABELS,
    AYAT_PER_JUZ,
    juz_equivalents_for_ayat,
    parse_memorized_csv,
    serialize_memorized,
    tier_for_ayat,
    tier_for_juz_equivalents,
)


def test_juz_equivalents_basic():
    assert juz_equivalents_for_ayat(0) == 0
    # 1 juz worth of ayat → ~1 juz-equivalent
    assert 0.99 < juz_equivalents_for_ayat(int(AYAT_PER_JUZ)) < 1.01
    # Full Quran
    assert juz_equivalents_for_ayat(6236) == 30


def test_tier_at_exact_checkpoints():
    assert tier_for_juz_equivalents(1) == "juz_1"
    assert tier_for_juz_equivalents(5) == "juz_5"
    assert tier_for_juz_equivalents(10) == "juz_10"
    assert tier_for_juz_equivalents(30) == "full"


def test_tier_between_checkpoints_rounds_down():
    assert tier_for_juz_equivalents(4.9) == "juz_1"  # not quite 5 juz yet
    assert tier_for_juz_equivalents(14.9) == "juz_10"
    assert tier_for_juz_equivalents(29.9) == "juz_25"


def test_tier_with_zero_memorization_is_juz_1():
    """A user with nothing memorized still has a tier (we don't block them
    from queueing — they just match against other tier-1 players)."""
    assert tier_for_juz_equivalents(0) == "juz_1"
    assert tier_for_juz_equivalents(-1) == "juz_1"


def test_tier_for_ayat_handles_full_quran():
    assert tier_for_ayat(6236) == "full"
    # Need at least one full juz' worth to leave the entry-level tier.
    # int(207.87) = 207 → just under 1 juz → still juz_1 (the floor tier).
    assert tier_for_ayat(208) == "juz_1"  # 1.001 juz → juz_1
    # 5 full juz worth (round up to clear the boundary)
    assert tier_for_ayat(int(AYAT_PER_JUZ * 5) + 1) == "juz_5"


def test_all_tier_labels_in_order():
    assert ALL_TIER_LABELS == [
        "juz_1", "juz_5", "juz_10", "juz_15", "juz_20", "juz_25", "full",
    ]


def test_csv_roundtrip():
    assert serialize_memorized({3, 1, 2}) == "1,2,3"
    assert parse_memorized_csv("1,2,3") == {1, 2, 3}
    assert parse_memorized_csv("") == set()
    assert serialize_memorized(set()) == ""
