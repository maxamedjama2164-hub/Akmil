"""Knowledge tiers — how matchmaking pools are partitioned.

A player declares both whole juz' AND individual surahs they've memorized.
Their tier is derived from the **count of unique ayat** their selections
cover, expressed in juz-equivalents (1 juz ≈ 207.87 ayat on average).

Tiers are intentionally NOT user-selectable to discourage sandbagging.
The picker constraint at match time still operates on the precise union
of (memorized juz' ∪ memorized surahs), so a user who only memorized
Al-Fatihah won't get tested on the rest of juz 1.
"""

from __future__ import annotations

TOTAL_AYAT = 6236  # canonical
AYAT_PER_JUZ = TOTAL_AYAT / 30  # 207.87

# Ordered checkpoints (ascending), in number of juz-equivalents memorized.
TIER_CHECKPOINTS: list[int] = [1, 5, 10, 15, 20, 25, 30]

TIER_LABELS: dict[int, str] = {
    1: "juz_1",
    5: "juz_5",
    10: "juz_10",
    15: "juz_15",
    20: "juz_20",
    25: "juz_25",
    30: "full",
}

ALL_TIER_LABELS: list[str] = [TIER_LABELS[c] for c in TIER_CHECKPOINTS]


def parse_memorized_csv(csv: str) -> set[int]:
    if not csv:
        return set()
    return {int(x) for x in csv.split(",") if x.strip()}


def serialize_memorized(juz: set[int]) -> str:
    return ",".join(str(j) for j in sorted(juz))


def juz_equivalents_for_ayat(ayat_count: int) -> float:
    """Convert a raw ayat count into "juz-equivalents" memorized."""
    return ayat_count / AYAT_PER_JUZ


def tier_for_juz_equivalents(juz_equiv: float) -> str:
    """Return the canonical tier label for a juz-equivalent count.

    Any non-zero memorization lands the user in tier `juz_1` at minimum —
    they can queue but only against other tier-1 players.
    """
    if juz_equiv <= 0:
        return TIER_LABELS[1]
    eligible = [c for c in TIER_CHECKPOINTS if c <= juz_equiv]
    return TIER_LABELS[max(eligible)] if eligible else TIER_LABELS[1]


def tier_for_ayat(ayat_count: int) -> str:
    return tier_for_juz_equivalents(juz_equivalents_for_ayat(ayat_count))


def is_valid_juz(j: int) -> bool:
    return 1 <= j <= 30


def is_valid_surah(s: int) -> bool:
    return 1 <= s <= 114
