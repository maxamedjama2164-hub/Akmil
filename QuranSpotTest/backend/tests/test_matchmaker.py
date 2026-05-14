import pytest

from app.services.matchmaker import (
    AJZA_WEIGHT,
    ELO_WEIGHT,
    INITIAL_THRESHOLD,
    Matchmaker,
    current_threshold,
    match_distance,
)


@pytest.fixture
def mm() -> Matchmaker:
    return Matchmaker()


def test_match_distance_zero_for_identical_players():
    assert match_distance(1200, 5.0, 1200, 5.0) == 0.0


def test_match_distance_weighted_components():
    # Pure ELO diff: 400 elo gap → ELO term = 1.0 → distance = 0.8
    assert match_distance(1000, 5.0, 1400, 5.0) == pytest.approx(ELO_WEIGHT)
    # Pure juz diff: 30 juz gap → juz term = 1.0 → distance = 0.2
    assert match_distance(1200, 0.0, 1200, 30.0) == pytest.approx(AJZA_WEIGHT)


def test_match_distance_clips_to_one_per_axis():
    # 1000 ELO diff still maps to ELO term 1.0 (clipped)
    assert match_distance(0, 0, 1000, 0) == pytest.approx(ELO_WEIGHT)


def test_threshold_grows_with_wait_time():
    assert current_threshold(0) == INITIAL_THRESHOLD
    assert current_threshold(10) > INITIAL_THRESHOLD
    assert current_threshold(100) > current_threshold(10)
    # Capped
    assert current_threshold(10_000) == 0.80


async def test_first_user_is_queued(mm):
    pair, entry = await mm.enqueue(user_id=1, rating=1200, juz_equivalent=5)
    assert pair is None
    assert entry.user_id == 1


async def test_close_match_pairs_immediately(mm):
    await mm.enqueue(user_id=1, rating=1200, juz_equivalent=5)
    # 50-ELO gap, 0 juz gap → distance 0.10 ≤ initial threshold 0.25
    pair, _ = await mm.enqueue(user_id=2, rating=1250, juz_equivalent=5)
    assert pair is not None
    assert {pair.a_user_id, pair.b_user_id} == {1, 2}


async def test_far_match_does_not_pair_immediately(mm):
    await mm.enqueue(user_id=1, rating=1200, juz_equivalent=5)
    # 400-ELO gap → distance 0.80 > initial 0.25
    pair, _ = await mm.enqueue(user_id=2, rating=1600, juz_equivalent=5)
    assert pair is None


async def test_cancel_removes_user(mm):
    await mm.enqueue(user_id=1, rating=1200, juz_equivalent=5)
    assert await mm.position(1) == 1
    assert await mm.cancel(1) is True
    assert await mm.position(1) is None


async def test_re_enqueue_replaces_old_entry(mm):
    await mm.enqueue(user_id=1, rating=1200, juz_equivalent=5)
    await mm.enqueue(user_id=1, rating=1250, juz_equivalent=8)
    assert await mm.position(1) == 1


async def test_picks_closest_candidate_when_multiple_match(mm):
    # All in band, but user 3 is the closest to user 4.
    await mm.enqueue(user_id=1, rating=1100, juz_equivalent=10)
    await mm.enqueue(user_id=2, rating=1150, juz_equivalent=10)
    await mm.enqueue(user_id=3, rating=1199, juz_equivalent=10)
    pair, _ = await mm.enqueue(user_id=4, rating=1200, juz_equivalent=10)
    assert pair is not None
    # Closest by ELO is user 3 (1199 vs 1200).
    assert {pair.a_user_id, pair.b_user_id} == {3, 4}
