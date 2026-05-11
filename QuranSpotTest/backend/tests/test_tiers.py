from app.services.tiers import (
    ALL_TIER_LABELS,
    parse_memorized_csv,
    serialize_memorized,
    tier_for_count,
    tier_for_memorized,
)


def test_tier_for_count_at_checkpoints():
    assert tier_for_count(1) == "juz_1"
    assert tier_for_count(5) == "juz_5"
    assert tier_for_count(10) == "juz_10"
    assert tier_for_count(30) == "full"


def test_tier_for_count_between_checkpoints():
    assert tier_for_count(4) == "juz_1"
    assert tier_for_count(9) == "juz_5"
    assert tier_for_count(14) == "juz_10"
    assert tier_for_count(29) == "juz_25"


def test_tier_for_count_below_minimum_clamps_to_one():
    assert tier_for_count(0) == "juz_1"
    assert tier_for_count(-3) == "juz_1"


def test_tier_for_memorized_uses_set_size():
    assert tier_for_memorized({1}) == "juz_1"
    assert tier_for_memorized({1, 2, 3, 4, 5}) == "juz_5"
    assert tier_for_memorized(set(range(1, 31))) == "full"


def test_all_tier_labels_in_order():
    assert ALL_TIER_LABELS == [
        "juz_1", "juz_5", "juz_10", "juz_15", "juz_20", "juz_25", "full",
    ]


def test_csv_roundtrip():
    assert serialize_memorized({3, 1, 2}) == "1,2,3"
    assert parse_memorized_csv("1,2,3") == {1, 2, 3}
    assert parse_memorized_csv("") == set()
    assert serialize_memorized(set()) == ""
