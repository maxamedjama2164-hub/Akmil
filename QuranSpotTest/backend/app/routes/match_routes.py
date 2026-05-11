"""Match-related REST endpoints.

The frontend polls `/api/matches/{id}` for state. Day 6 swaps polling for WS.
"""

from __future__ import annotations

import asyncio
import time
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import Match, Rating, User
from app.schemas import (
    MatchOut,
    MatchPlayerOut,
    PickRequest,
    QuickmatchRequest,
    QuickmatchResponse,
    RoundOut,
)
from app.services import elo as elo_mod
from app.services import match_engine
from app.services.audio_pipeline import AudioDecodeError, decode_to_pcm
from app.services.tiers import tier_for_memorized

router = APIRouter(prefix="/api/matches", tags=["matches"])

MAX_AUDIO_BYTES = 5 * 1024 * 1024
MIN_AUDIO_SAMPLES = int(16000 * 0.3)


def _player_out(user: User) -> MatchPlayerOut:
    mem = user.memorized_juz
    return MatchPlayerOut(
        id=user.id,
        display_name=user.display_name,
        memorized_juz=sorted(mem),
        tier=tier_for_memorized(mem),
    )


def _round_out(r) -> RoundOut:
    target_ayat = None
    if r.target_ayat_csv:
        target_ayat = []
        for part in r.target_ayat_csv.split(","):
            s, n = part.split(":")
            target_ayat.append({"surah": int(s), "number": int(n)})
    return RoundOut(
        number=r.number,
        picker_id=r.picker_id,
        reciter_id=r.reciter_id,
        status=r.status,
        surah=r.surah,
        start_ayah=r.start_ayah,
        target_text=r.target_text,
        target_ayat=target_ayat,
        transcript=r.transcript,
        accuracy=r.accuracy,
        passed=r.passed,
        reason=r.reason,
    )


def _match_out(db: Session, match: Match) -> MatchOut:
    a = db.get(User, match.player_a_id)
    b = db.get(User, match.player_b_id)
    return MatchOut(
        id=match.id,
        status=match.status,
        tier=match.tier,
        round_count=match.round_count,
        player_a=_player_out(a),
        player_b=_player_out(b),
        a_wins=match.a_wins,
        b_wins=match.b_wins,
        a_rating_before=match.a_rating_before,
        b_rating_before=match.b_rating_before,
        a_rating_after=match.a_rating_after,
        b_rating_after=match.b_rating_after,
        rounds=[_round_out(r) for r in sorted(match.rounds, key=lambda r: r.number)],
        is_private=match.is_private,
        created_at=match.created_at,
        completed_at=match.completed_at,
    )


def _ensure_player(match: Match, user_id: int) -> None:
    if user_id not in (match.player_a_id, match.player_b_id):
        raise HTTPException(403, detail="not a player in this match")


@router.post("/quickmatch", response_model=QuickmatchResponse)
async def quickmatch(
    payload: QuickmatchRequest,
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    memorized = current.memorized_juz
    if not memorized:
        raise HTTPException(400, detail="set your memorized juz' before queueing")
    tier = tier_for_memorized(memorized)

    rating_row = db.get(Rating, (current.id, tier))
    rating = rating_row.rating if rating_row else elo_mod.DEFAULT_RATING

    matchmaker = request.app.state.matchmaker
    pair, entry = await matchmaker.enqueue(current.id, tier, rating)

    if pair is None:
        pos = await matchmaker.position(current.id, tier) or 1
        return QuickmatchResponse(
            status="queued", queue_position=pos, tier=tier
        )

    match = match_engine.create_match(
        db,
        player_a_id=pair.a_user_id,
        player_b_id=pair.b_user_id,
        tier=tier,
        round_count=payload.round_count,
    )
    db.commit()

    # Push to the OTHER user (the one who was already waiting in queue);
    # the calling user gets the match_id in this HTTP response.
    other_user_id = (
        pair.a_user_id if pair.b_user_id == current.id else pair.b_user_id
    )
    await request.app.state.connections.send_to_user(
        other_user_id, {"type": "match_found", "match_id": match.id}
    )
    return QuickmatchResponse(status="matched", match_id=match.id, tier=tier)


@router.post("/cancel-queue")
async def cancel_queue(
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
) -> dict:
    removed = await request.app.state.matchmaker.cancel(current.id)
    return {"cancelled": removed}


@router.get("/{match_id}", response_model=MatchOut)
def get_match(
    match_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MatchOut:
    match = db.get(Match, match_id)
    if match is None:
        raise HTTPException(404, detail="match not found")
    _ensure_player(match, current.id)
    return _match_out(db, match)


@router.get("/", response_model=list[MatchOut])
def history(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = 20,
) -> list[MatchOut]:
    rows = (
        db.query(Match)
        .filter(
            (Match.player_a_id == current.id) | (Match.player_b_id == current.id),
        )
        .order_by(Match.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_match_out(db, m) for m in rows]


@router.post("/{match_id}/pick", response_model=MatchOut)
async def pick(
    match_id: int,
    payload: PickRequest,
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MatchOut:
    match = db.get(Match, match_id)
    if match is None:
        raise HTTPException(404, detail="match not found")
    _ensure_player(match, current.id)

    try:
        match_engine.pick(
            db,
            request.app.state.quran,
            match=match,
            user_id=current.id,
            surah=payload.surah,
            start_ayah=payload.start_ayah,
        )
    except match_engine.NotYourTurn as e:
        raise HTTPException(403, detail=str(e))
    except match_engine.InvalidPick as e:
        raise HTTPException(400, detail=str(e))
    except match_engine.MatchEngineError as e:
        raise HTTPException(409, detail=str(e))
    db.commit()
    db.refresh(match)
    out = _match_out(db, match)
    await request.app.state.connections.broadcast_match(
        match.id, {"type": "state", "match": out.model_dump(mode="json")}
    )
    return out


@router.post("/{match_id}/recording", response_model=MatchOut)
async def submit_recording(
    match_id: int,
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
) -> MatchOut:
    match = db.get(Match, match_id)
    if match is None:
        raise HTTPException(404, detail="match not found")
    _ensure_player(match, current.id)

    raw = await file.read()
    if len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="audio too large"
        )
    try:
        audio = decode_to_pcm(raw)
    except AudioDecodeError as e:
        raise HTTPException(400, detail=f"audio decode failed: {e}")
    if audio.size < MIN_AUDIO_SAMPLES:
        raise HTTPException(400, detail="audio shorter than 300ms")

    loop = asyncio.get_running_loop()
    transcript = await loop.run_in_executor(
        request.app.state.tx_executor,
        request.app.state.whisper.transcribe,
        audio,
    )

    try:
        match_engine.submit_score(
            db, match=match, user_id=current.id, transcript=transcript
        )
    except match_engine.NotYourTurn as e:
        raise HTTPException(403, detail=str(e))
    except match_engine.MatchEngineError as e:
        raise HTTPException(409, detail=str(e))
    db.commit()
    db.refresh(match)
    out = _match_out(db, match)
    await request.app.state.connections.broadcast_match(
        match.id, {"type": "state", "match": out.model_dump(mode="json")}
    )
    return out
