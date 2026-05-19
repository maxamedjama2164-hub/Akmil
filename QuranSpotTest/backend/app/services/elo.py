"""ELO rating updates. One module per concept, one tier per user, lazy-init at 1200.

K-factor is **tiered** so a new player's rating finds its real level quickly,
then settles down. Standard chess uses a "provisional" K-bump until games_played
crosses a threshold; we smooth it out with four tiers.
"""

from __future__ import annotations

DEFAULT_RATING = 1200
ELO_FLOOR = 800

# K-factor schedule: very volatile early, calmer once established.
#   games_played | K   | per-game swing at 50/50 expectations
#       0-4      | 40  | ±20
#       5-14     | 30  | ±15
#      15-29     | 20  | ±10
#      30+       | 12  | ±6
K_TIERS: list[tuple[int, int]] = [
    (5, 40),
    (15, 30),
    (30, 20),
]
K_ESTABLISHED = 12

# Kept for any external import. New code should use `k_factor(games)`.
K_PROVISIONAL = K_TIERS[0][1]
PROVISIONAL_GAMES = K_TIERS[-1][0]


def expected(rating_a: int, rating_b: int) -> float:
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400))


def k_factor(games_played: int) -> int:
    for threshold, k in K_TIERS:
        if games_played < threshold:
            return k
    return K_ESTABLISHED


def update_pair(
    rating_a: int,
    rating_b: int,
    score_a: float,
    games_a: int,
    games_b: int,
) -> tuple[int, int]:
    """Update both players' ratings given a match outcome.

    `score_a` is the result for player A in [0, 1] — 1 = A won, 0.5 = draw,
    0 = B won. Returns `(new_a, new_b)` rounded to int.
    """
    if not 0.0 <= score_a <= 1.0:
        raise ValueError("score_a must be in [0, 1]")
    e_a = expected(rating_a, rating_b)
    delta_a = k_factor(games_a) * (score_a - e_a)
    delta_b = k_factor(games_b) * ((1.0 - score_a) - (1.0 - e_a))
    new_a = max(ELO_FLOOR, rating_a + round(delta_a))
    new_b = max(ELO_FLOOR, rating_b + round(delta_b))
    return new_a, new_b
