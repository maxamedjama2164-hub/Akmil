"""In-memory registry of pending private-match invites.

An invite is created by a challenger via `POST /api/invites`, which returns
a short code. The challenger shares the URL `/invite/{code}` with a friend;
when the friend accepts, the registry hands back the invite (and removes it)
so the match handler can spin up a regular Match between the two users.

Lives in process state — fine for a single-process MVP. Drop-in Redis later.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass

INVITE_TTL_S = 60 * 60 * 24  # 24h


@dataclass
class Invite:
    code: str
    challenger_id: int
    round_count: int
    created_at: float


class InviteRegistry:
    def __init__(self) -> None:
        self._invites: dict[str, Invite] = {}
        self._lock = asyncio.Lock()

    async def create(self, challenger_id: int, round_count: int) -> Invite:
        async with self._lock:
            # Try a few times for a free code.
            for _ in range(8):
                code = secrets.token_urlsafe(6)
                if code not in self._invites:
                    break
            else:
                raise RuntimeError("could not generate unique invite code")
            invite = Invite(
                code=code,
                challenger_id=challenger_id,
                round_count=round_count,
                created_at=time.time(),
            )
            self._invites[code] = invite
            self._evict_expired_locked()
            return invite

    async def get(self, code: str) -> Invite | None:
        async with self._lock:
            self._evict_expired_locked()
            return self._invites.get(code)

    async def consume(self, code: str) -> Invite | None:
        """Atomically remove and return an invite — used on accept."""
        async with self._lock:
            self._evict_expired_locked()
            return self._invites.pop(code, None)

    async def cancel(self, code: str, user_id: int) -> bool:
        async with self._lock:
            invite = self._invites.get(code)
            if invite is None or invite.challenger_id != user_id:
                return False
            del self._invites[code]
            return True

    def _evict_expired_locked(self) -> None:
        now = time.time()
        stale = [
            c
            for c, inv in self._invites.items()
            if now - inv.created_at > INVITE_TTL_S
        ]
        for c in stale:
            del self._invites[c]
