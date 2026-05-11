"""WebSocket endpoints. Auth is via JWT in the `token` query parameter
(browsers can't set the Authorization header on a WebSocket connect).
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.auth import _decode_user_id
from app.db import SessionLocal
from app.models import Match, User

router = APIRouter(tags=["ws"])
log = logging.getLogger("quranspot.ws")


def _authenticate(token: str | None) -> int | None:
    if not token:
        return None
    return _decode_user_id(token)


@router.websocket("/ws/lobby")
async def ws_lobby(
    websocket: WebSocket,
    token: str | None = Query(default=None),
) -> None:
    user_id = _authenticate(token)
    if user_id is None:
        await websocket.close(code=1008)
        return

    # Verify the user actually exists (token could outlive the user).
    db = SessionLocal()
    try:
        if db.get(User, user_id) is None:
            await websocket.close(code=1008)
            return
    finally:
        db.close()

    await websocket.accept()
    manager = websocket.app.state.connections
    await manager.connect_lobby(user_id, websocket)
    try:
        # Keep the connection alive by reading. We don't act on client
        # messages here — all state changes happen via REST.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.debug("ws_lobby loop error: %s", e)
    finally:
        await manager.disconnect_lobby(user_id, websocket)


@router.websocket("/ws/match/{match_id}")
async def ws_match(
    websocket: WebSocket,
    match_id: int,
    token: str | None = Query(default=None),
) -> None:
    user_id = _authenticate(token)
    if user_id is None:
        await websocket.close(code=1008)
        return

    # Lazy import to avoid circular: the helper is in match_routes.
    from app.routes.match_routes import _match_out  # noqa: WPS433

    db = SessionLocal()
    try:
        match = db.get(Match, match_id)
        if match is None or user_id not in (match.player_a_id, match.player_b_id):
            await websocket.close(code=1008)
            return
        initial_payload = _match_out(db, match).model_dump(mode="json")
    finally:
        db.close()

    await websocket.accept()
    manager = websocket.app.state.connections
    await manager.connect_match(match_id, websocket)

    try:
        await websocket.send_json({"type": "state", "match": initial_payload})
        while True:
            # Drain client messages (we use REST for actions). Mainly keeps
            # the connection considered "active".
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        pass
    except Exception as e:
        log.debug("ws_match loop error: %s", e)
    finally:
        await manager.disconnect_match(match_id, websocket)
