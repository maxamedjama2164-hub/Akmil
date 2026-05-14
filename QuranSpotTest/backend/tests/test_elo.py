from app.services.elo import (
    DEFAULT_RATING,
    K_ESTABLISHED,
    K_PROVISIONAL,
    K_TIERS,
    expected,
    k_factor,
    update_pair,
)


def test_expected_symmetric_when_equal():
    assert expected(1200, 1200) == 0.5


def test_expected_higher_rated_is_favored():
    assert expected(1400, 1200) > 0.5
    assert expected(1200, 1400) < 0.5
    # Sum to 1
    assert expected(1400, 1200) + expected(1200, 1400) == 1.0


def test_k_factor_decreases_with_experience():
    # Monotonically non-increasing across the lifecycle.
    games = [0, 4, 5, 14, 15, 29, 30, 1000]
    ks = [k_factor(g) for g in games]
    assert ks == sorted(ks, reverse=True)


def test_k_factor_tier_boundaries():
    # 4 games left in the most-volatile tier; 5 games crosses into next.
    assert k_factor(0) == K_TIERS[0][1]
    assert k_factor(4) == K_TIERS[0][1]
    assert k_factor(5) == K_TIERS[1][1]
    assert k_factor(15) == K_TIERS[2][1]
    assert k_factor(30) == K_ESTABLISHED
    assert k_factor(1000) == K_ESTABLISHED


def test_first_game_is_more_volatile_than_30th():
    # Same matchup, different experience levels.
    early_a, _ = update_pair(1200, 1200, score_a=1.0, games_a=0, games_b=0)
    late_a, _ = update_pair(1200, 1200, score_a=1.0, games_a=100, games_b=100)
    assert (early_a - 1200) > (late_a - 1200) * 2


def test_winner_gains_loser_loses():
    a_after, b_after = update_pair(1200, 1200, score_a=1.0, games_a=0, games_b=0)
    assert a_after > 1200
    assert b_after < 1200
    # Same K → swap exactly
    assert (a_after - 1200) == -(b_after - 1200)


def test_draw_leaves_equal_ratings_unchanged():
    a_after, b_after = update_pair(1200, 1200, score_a=0.5, games_a=0, games_b=0)
    assert a_after == 1200
    assert b_after == 1200


def test_underdog_win_gains_more_than_favorite_win():
    underdog, favorite = update_pair(1000, 1400, score_a=1.0, games_a=0, games_b=0)
    fav, und = update_pair(1400, 1000, score_a=1.0, games_a=0, games_b=0)
    assert underdog - 1000 > fav - 1400


def test_role_swap_mirrors_deltas():
    """Two ways to express "the lower-rated player won":
      (1) update(R_low, R_high, score_a=1)   ← lower-rated is A and won
      (2) update(R_high, R_low, score_a=0)   ← higher-rated is A and lost
    The magnitudes should match (with positions swapped)."""
    low_after, high_after_1 = update_pair(1100, 1300, score_a=1.0, games_a=0, games_b=0)
    high_after_2, low_after_2 = update_pair(1300, 1100, score_a=0.0, games_a=0, games_b=0)
    assert low_after == low_after_2
    assert high_after_1 == high_after_2
