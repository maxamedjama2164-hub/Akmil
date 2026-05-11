"""In-memory matchmaker keyed by tier with a widening ELO band.

Designed so the public method signature (`enqueue`) stays the same when we
swap the backing store to Redis (sorted sets keyed by tier, scored by ELO).
"""

from __future__ import annotations

import asyncio
import secrets
import time
from collections import defaultdict
from dataclasses import dataclass

INITIAL_BAND = 100        # ELO points
BAND_GROWTH_EVERY_S = 5   # how often the band widens
BAND_GROWTH_PER_STEP = 50
MAX_BAND = 400


@dataclass
class QueueEntry:
    queue_id: str
    user_id: int
    rating: int
    joined_at: float


@dataclass
class MatchPair:
    """The two user ids the matchmaker decided to pair. Caller creates the
    Match row; the matchmaker doesn't talk to the DB."""

    a_user_id: int
    b_user_id: int
    a_rating: int
    b_rating: int
    tier: str


class Matchmaker:
    def __init__(self) -> None:
        self._queues: dict[str, list[QueueEntry]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def enqueue(
        self, user_id: int, tier: str, rating: int
    ) -> tuple[MatchPair | None, QueueEntry]:
        """Try to pair the user immediately; otherwise add them to the tier queue.

        Returns `(MatchPair, entry)` if a match was made (entry.queue_id is
        still useful for the response), or `(None, entry)` if queued.
        """
        async with self._lock:
            # Remove any stale entry for this user (e.g. re-quickmatch after disconnect)
            self._remove_user_locked(user_id)
            queue = self._queues[tier]
            now = time.time()

            for i, other in enumerate(queue):
                if other.user_id == user_id:
                    continue
                wait = now - other.joined_at
                band = min(
                    MAX_BAND,
                    INITIAL_BAND + int(wait // BAND_GROWTH_EVERY_S) * BAND_GROWTH_PER_STEP,
                )
                if abs(other.rating - rating) <= band:
                    queue.pop(i)
                    pair = MatchPair(
                        a_user_id=other.user_id,
                        b_user_id=user_id,
                        a_rating=other.rating,
                        b_rating=rating,
                        tier=tier,
                    )
                    entry = QueueEntry(
                        queue_id=secrets.token_urlsafe(12),
                        user_id=user_id,
                        rating=rating,
                        joined_at=now,
                    )
                    return pair, entry

            entry = QueueEntry(
                queue_id=secrets.token_urlsafe(12),
                user_id=user_id,
                rating=rating,
                joined_at=now,
            )
            queue.append(entry)
            return None, entry

    async def cancel(self, user_id: int) -> bool:
        async with self._lock:
            return self._remove_user_locked(user_id)

    async def position(self, user_id: int, tier: str) -> int | None:
        """1-based queue position, or None if not queued."""
        async with self._lock:
            queue = self._queues.get(tier, [])
            for i, e in enumerate(queue):
                if e.user_id == user_id:
                    return i + 1
            return None

    def _remove_user_locked(self, user_id: int) -> bool:
        removed = False
        for tier, queue in self._queues.items():
            for i, e in enumerate(queue):
                if e.user_id == user_id:
                    queue.pop(i)
                    removed = True
                    break
        return removed
