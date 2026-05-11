from app.services.elo import (
    DEFAULT_RATING,
    K_ESTABLISHED,
    K_PROVISIONAL,
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


def test_k_factor_threshold():
    assert k_factor(0) == K_PROVISIONAL
    assert k_factor(29) == K_PROVISIONAL
    assert k_factor(30) == K_ESTABLISHED
    assert k_factor(1000) == K_ESTABLISHED


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
