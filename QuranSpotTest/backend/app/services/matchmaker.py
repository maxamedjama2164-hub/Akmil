"""Single-queue matchmaker keyed by a weighted (ELO, ajza-count) distance.

We pair the new entrant with the queued user whose `match_distance` is
within the candidate's current band. The distance is normalized so 0 = a
perfect match and 1 = the worst plausible pairing:

    distance = ELO_WEIGHT  * min(1, |Δelo|  / ELO_NORM)
             + AJZA_WEIGHT * min(1, |Δjuz|  / AJZA_NORM)

The band starts strict (small threshold) and grows linearly with the
candidate's wait time, so people don't wait forever in a thin pool.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass

# ── tuning ────────────────────────────────────────────────────────────
ELO_WEIGHT = 0.8
AJZA_WEIGHT = 0.2
ELO_NORM = 400.0        # ΔELO that maps to 1.0 in the ELO term
AJZA_NORM = 30.0        # Δjuz-equiv mapping to 1.0 in the ajza term

INITIAL_THRESHOLD = 0.25
THRESHOLD_GROWTH_PER_STEP = 0.05
THRESHOLD_GROWTH_EVERY_S = 5
MAX_THRESHOLD = 0.80
# ──────────────────────────────────────────────────────────────────────


@dataclass
class QueueEntry:
    queue_id: str
    user_id: int
    rating: int
    juz_equivalent: float
    joined_at: float


@dataclass
class MatchPair:
    """The two users the matchmaker decided to pair. Caller creates the
    Match row; the matchmaker doesn't talk to the DB."""

    a_user_id: int
    b_user_id: int
    a_rating: int
    b_rating: int


def match_distance(
    elo_a: int, juz_a: float, elo_b: int, juz_b: float
) -> float:
    elo_term = min(1.0, abs(elo_a - elo_b) / ELO_NORM)
    juz_term = min(1.0, abs(juz_a - juz_b) / AJZA_NORM)
    return ELO_WEIGHT * elo_term + AJZA_WEIGHT * juz_term


def current_threshold(wait_seconds: float) -> float:
    steps = int(wait_seconds // THRESHOLD_GROWTH_EVERY_S)
    return min(
        MAX_THRESHOLD, INITIAL_THRESHOLD + steps * THRESHOLD_GROWTH_PER_STEP
    )


class Matchmaker:
    def __init__(self) -> None:
        self._queue: list[QueueEntry] = []
        self._lock = asyncio.Lock()

    async def enqueue(
        self, user_id: int, rating: int, juz_equivalent: float
    ) -> tuple[MatchPair | None, QueueEntry]:
        """Try to pair the user immediately; otherwise add them to the queue."""
        async with self._lock:
            self._remove_user_locked(user_id)
            now = time.time()

            # Find the best (smallest distance) candidate that's within their
            # band. FIFO tie-break is implicit via the iteration order.
            best_idx: int | None = None
            best_distance = float("inf")
            for i, other in enumerate(self._queue):
                if other.user_id == user_id:
                    continue
                d = match_distance(
                    rating, juz_equivalent, other.rating, other.juz_equivalent
                )
                threshold = current_threshold(now - other.joined_at)
                if d <= threshold and d < best_distance:
                    best_idx = i
                    best_distance = d

            if best_idx is not None:
                other = self._queue.pop(best_idx)
                pair = MatchPair(
                    a_user_id=other.user_id,
                    b_user_id=user_id,
                    a_rating=other.rating,
                    b_rating=rating,
                )
                entry = QueueEntry(
                    queue_id=secrets.token_urlsafe(12),
                    user_id=user_id,
                    rating=rating,
                    juz_equivalent=juz_equivalent,
                    joined_at=now,
                )
                return pair, entry

            entry = QueueEntry(
                queue_id=secrets.token_urlsafe(12),
                user_id=user_id,
                rating=rating,
                juz_equivalent=juz_equivalent,
                joined_at=now,
            )
            self._queue.append(entry)
            return None, entry

    async def cancel(self, user_id: int) -> bool:
        async with self._lock:
            return self._remove_user_locked(user_id)

    async def position(self, user_id: int) -> int | None:
        """1-based queue position, or None if not queued."""
        async with self._lock:
            for i, e in enumerate(self._queue):
                if e.user_id == user_id:
                    return i + 1
            return None

    def _remove_user_locked(self, user_id: int) -> bool:
        for i, e in enumerate(self._queue):
            if e.user_id == user_id:
                self._queue.pop(i)
                return True
        return False
