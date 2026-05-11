"""Knowledge tiers — how matchmaking pools are partitioned.

A player's tier is determined by how many juz' they've memorized:
the largest checkpoint not exceeding their memorized count. The label
`full` is the top tier (30 juz, full hifz).

Tiers are intentionally NOT user-selectable to discourage sandbagging;
they're derived from the user's declared memorization. The opponent
restricts picks to the reciter's actual memorized juz' set, regardless
of tier.
"""

from __future__ import annotations

# Ordered checkpoints (ascending). Anything ≥ 30 maps to "full".
TIER_CHECKPOINTS: list[int] = [1, 5, 10, 15, 20, 25, 30]

# Canonical labels used in DB rows and API responses.
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
MIN_MEMORIZED = 1


def parse_memorized_csv(csv: str) -> set[int]:
    if not csv:
        return set()
    return {int(x) for x in csv.split(",") if x.strip()}


def serialize_memorized(juz: set[int]) -> str:
    return ",".join(str(j) for j in sorted(juz))


def tier_for_count(count: int) -> str:
    """Return the canonical tier label for a memorized-juz count.

    A user must have memorized at least one juz to be tiered. Counts
    below 1 are clamped to tier 1 (so they can still queue, but only
    against other tier-1 players).
    """
    if count < MIN_MEMORIZED:
        return TIER_LABELS[1]
    eligible = [c for c in TIER_CHECKPOINTS if c <= count]
    return TIER_LABELS[max(eligible)] if eligible else TIER_LABELS[1]


def tier_for_memorized(memorized: set[int]) -> str:
    return tier_for_count(len(memorized))


def is_valid_juz(j: int) -> bool:
    return 1 <= j <= 30
