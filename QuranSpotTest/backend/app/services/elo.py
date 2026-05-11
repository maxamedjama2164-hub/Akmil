"""ELO rating updates. One module per concept, one tier per user, lazy-init at 1200."""

from __future__ import annotations

DEFAULT_RATING = 1200
PROVISIONAL_GAMES = 30
K_PROVISIONAL = 32
K_ESTABLISHED = 16


def expected(rating_a: int, rating_b: int) -> float:
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400))


def k_factor(games_played: int) -> int:
    return K_PROVISIONAL if games_played < PROVISIONAL_GAMES else K_ESTABLISHED


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
    return rating_a + round(delta_a), rating_b + round(delta_b)
