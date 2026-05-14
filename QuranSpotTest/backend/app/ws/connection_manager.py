"""Tracks active WebSocket connections so server-side events can be pushed
to interested clients.

Two pools:
  - `match_conns`: keyed by match_id; receives match-state updates.
  - `lobby_conns`: keyed by user_id; receives matchmaking events. A single
    user may have multiple tabs open, so we keep a set of sockets per id.

All public methods are async and acquire an internal lock. Broadcasts send
outside the lock so a slow client can't block other deliveries.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState

log = logging.getLogger("quranspot.ws")


class ConnectionManager:
    def __init__(self) -> None:
        self.match_conns: dict[int, set[WebSocket]] = defaultdict(set)
        self.lobby_conns: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    # ─── Match channel ────────────────────────────────────────────────
    async def connect_match(self, match_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self.match_conns[match_id].add(ws)

    async def disconnect_match(self, match_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self.match_conns[match_id].discard(ws)
            if not self.match_conns[match_id]:
                self.match_conns.pop(match_id, None)

    async def broadcast_match(self, match_id: int, payload: dict[str, Any]) -> None:
        async with self._lock:
            conns = list(self.match_conns.get(match_id, ()))
        await self._send_many(conns, payload)

    async def broadcast_match_except(
        self,
        match_id: int,
        payload: dict[str, Any],
        *,
        exclude: WebSocket | None,
    ) -> None:
        """Same as broadcast_match but skips one socket (the sender). Used
        for relaying client-originated JSON messages like WebRTC signaling."""
        async with self._lock:
            conns = [
                ws
                for ws in self.match_conns.get(match_id, ())
                if ws is not exclude
            ]
        await self._send_many(conns, payload)

    async def relay_match_bytes(
        self,
        match_id: int,
        data: bytes,
        exclude: WebSocket | None = None,
    ) -> None:
        """Relay a raw binary frame (e.g. an audio chunk) to all sockets in
        a match except the sender."""
        async with self._lock:
            conns = [
                ws
                for ws in self.match_conns.get(match_id, ())
                if ws is not exclude
            ]
        for ws in conns:
            if ws.client_state != WebSocketState.CONNECTED:
                continue
            try:
                await ws.send_bytes(data)
            except Exception as e:
                log.debug("ws binary send failed: %s", e)

    # ─── Lobby channel ────────────────────────────────────────────────
    async def connect_lobby(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self.lobby_conns[user_id].add(ws)

    async def disconnect_lobby(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self.lobby_conns[user_id].discard(ws)
            if not self.lobby_conns[user_id]:
                self.lobby_conns.pop(user_id, None)

    async def send_to_user(self, user_id: int, payload: dict[str, Any]) -> None:
        async with self._lock:
            conns = list(self.lobby_conns.get(user_id, ()))
        await self._send_many(conns, payload)

    # ─── Internals ────────────────────────────────────────────────────
    async def _send_many(
        self, conns: list[WebSocket], payload: dict[str, Any]
    ) -> None:
        # Serialize once.
        msg = json.dumps(payload, default=str)
        for ws in conns:
            if ws.client_state != WebSocketState.CONNECTED:
                continue
            try:
                await ws.send_text(msg)
            except Exception as e:
                # Cleanup happens on the route's disconnect handler; we just
                # log and continue.
                log.debug("ws send failed: %s", e)
