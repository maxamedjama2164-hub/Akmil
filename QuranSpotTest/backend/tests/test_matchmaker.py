import pytest

from app.services.matchmaker import Matchmaker


@pytest.fixture
def mm() -> Matchmaker:
    return Matchmaker()


async def test_first_user_is_queued(mm):
    pair, entry = await mm.enqueue(user_id=1, tier="juz_5", rating=1200)
    assert pair is None
    assert entry.user_id == 1


async def test_second_user_at_similar_rating_pairs(mm):
    await mm.enqueue(user_id=1, tier="juz_5", rating=1200)
    pair, _ = await mm.enqueue(user_id=2, tier="juz_5", rating=1250)
    assert pair is not None
    assert {pair.a_user_id, pair.b_user_id} == {1, 2}
    assert pair.tier == "juz_5"


async def test_different_tiers_do_not_pair(mm):
    await mm.enqueue(user_id=1, tier="juz_5", rating=1200)
    pair, _ = await mm.enqueue(user_id=2, tier="juz_10", rating=1200)
    assert pair is None


async def test_outside_band_does_not_pair(mm):
    # 1200 vs 1500 = 300 gap, initial band is 100 → no pair.
    await mm.enqueue(user_id=1, tier="juz_5", rating=1200)
    pair, _ = await mm.enqueue(user_id=2, tier="juz_5", rating=1500)
    assert pair is None


async def test_cancel_removes_user(mm):
    await mm.enqueue(user_id=1, tier="juz_5", rating=1200)
    assert await mm.position(1, "juz_5") == 1
    assert await mm.cancel(1) is True
    assert await mm.position(1, "juz_5") is None


async def test_re_enqueue_replaces_old_entry(mm):
    """If the same user enqueues twice, the old entry should be cleared so
    they don't appear twice in the queue."""
    await mm.enqueue(user_id=1, tier="juz_5", rating=1200)
    await mm.enqueue(user_id=1, tier="juz_5", rating=1250)
    assert await mm.position(1, "juz_5") == 1


async def test_returns_queue_position(mm):
    await mm.enqueue(user_id=1, tier="juz_10", rating=1200)
    # Big gap, so user 2 stays queued (not paired)
    await mm.enqueue(user_id=2, tier="juz_10", rating=1700)
    assert await mm.position(1, "juz_10") == 1
    assert await mm.position(2, "juz_10") == 2
