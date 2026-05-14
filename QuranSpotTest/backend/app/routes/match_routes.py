"""Match-related REST endpoints. Single unified rating, distance-based matchmaking."""

from __future__ import annotations

import asyncio
import base64
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
from app.models import Match, User
from app.schemas import (
    AcceptInviteResponse,
    CreateInviteRequest,
    FinalizeRequest,
    InviteOut,
    MatchOut,
    MatchPlayerOut,
    PickRequest,
    QuickmatchRequest,
    QuickmatchResponse,
    RoundOut,
)
from app.services import match_engine
from app.services.audio_pipeline import AudioDecodeError, decode_to_pcm
from app.services.tiers import juz_equivalents_for_ayat

router = APIRouter(prefix="/api/matches", tags=["matches"])

MAX_AUDIO_BYTES = 5 * 1024 * 1024
MIN_AUDIO_SAMPLES = int(16000 * 0.3)


def _juz_equiv_for(user: User, quran) -> float:
    ayat = quran.count_memorized_ayat(user.memorized_juz, user.memorized_surahs)
    return juz_equivalents_for_ayat(ayat)


def _player_out(user: User, quran) -> MatchPlayerOut:
    juz_eq = _juz_equiv_for(user, quran)
    return MatchPlayerOut(
        id=user.id,
        display_name=user.display_name,
        memorized_juz=sorted(user.memorized_juz),
        memorized_surahs=sorted(user.memorized_surahs),
        juz_equivalent=round(juz_eq, 2),
        rating=user.rating,
    )


def _round_out(r, *, quran=None) -> RoundOut:
    target_ayat = None
    if r.target_ayat_csv:
        target_ayat = []
        for part in r.target_ayat_csv.split(","):
            s, n = part.split(":")
            target_ayat.append({"surah": int(s), "number": int(n)})
    start_text = None
    if quran is not None and r.surah is not None and r.start_ayah is not None:
        picked = quran.get_ayah(r.surah, r.start_ayah)
        if picked is not None:
            start_text = picked.text_uthmani
    return RoundOut(
        number=r.number,
        picker_id=r.picker_id,
        reciter_id=r.reciter_id,
        status=r.status,
        surah=r.surah,
        start_ayah=r.start_ayah,
        start_ayah_text_uthmani=start_text,
        target_text=r.target_text,
        target_ayat=target_ayat,
        transcript=r.transcript,
        accuracy=r.accuracy,
        passed=r.passed,
        reason=r.reason,
        finalized=r.finalized,
        overridden=r.overridden,
        winner_id=r.winner_id,
    )


def _match_out(db: Session, match: Match, *, quran) -> MatchOut:
    a = db.get(User, match.player_a_id)
    b = db.get(User, match.player_b_id)
    return MatchOut(
        id=match.id,
        status=match.status,
        round_count=match.round_count,
        player_a=_player_out(a, quran),
        player_b=_player_out(b, quran),
        a_wins=match.a_wins,
        b_wins=match.b_wins,
        a_rating_before=match.a_rating_before,
        b_rating_before=match.b_rating_before,
        a_rating_after=match.a_rating_after,
        b_rating_after=match.b_rating_after,
        rounds=[
            _round_out(r, quran=quran)
            for r in sorted(match.rounds, key=lambda r: r.number)
        ],
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
    if not current.memorized_juz and not current.memorized_surahs:
        raise HTTPException(
            400, detail="set your memorized juz'/surahs before queueing"
        )
    quran = request.app.state.quran
    juz_eq = _juz_equiv_for(current, quran)

    matchmaker = request.app.state.matchmaker
    pair, _entry = await matchmaker.enqueue(
        current.id, current.rating, juz_eq
    )

    if pair is None:
        pos = await matchmaker.position(current.id) or 1
        return QuickmatchResponse(status="queued", queue_position=pos)

    match = match_engine.create_match(
        db,
        player_a_id=pair.a_user_id,
        player_b_id=pair.b_user_id,
        round_count=payload.round_count,
    )
    db.commit()

    other_user_id = (
        pair.a_user_id if pair.b_user_id == current.id else pair.b_user_id
    )
    await request.app.state.connections.send_to_user(
        other_user_id, {"type": "match_found", "match_id": match.id}
    )
    return QuickmatchResponse(status="matched", match_id=match.id)


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
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MatchOut:
    match = db.get(Match, match_id)
    if match is None:
        raise HTTPException(404, detail="match not found")
    _ensure_player(match, current.id)
    return _match_out(db, match, quran=request.app.state.quran)


@router.get("/", response_model=list[MatchOut])
def history(
    request: Request,
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
    return [_match_out(db, m, quran=request.app.state.quran) for m in rows]


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
    out = _match_out(db, match, quran=request.app.state.quran)
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
    out = _match_out(db, match, quran=request.app.state.quran)
    connections = request.app.state.connections
    cur = next((r for r in out.rounds if r.transcript and not r.finalized), None)
    if cur is not None:
        await connections.broadcast_match(
            match.id,
            {
                "type": "round_audio",
                "round_number": cur.number,
                "mime": file.content_type or "audio/webm",
                "audio_b64": base64.b64encode(raw).decode("ascii"),
            },
        )
    await connections.broadcast_match(
        match.id, {"type": "state", "match": out.model_dump(mode="json")}
    )
    return out


@router.post("/{match_id}/rounds/{round_number}/finalize", response_model=MatchOut)
async def finalize_round(
    match_id: int,
    round_number: int,
    payload: FinalizeRequest,
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MatchOut:
    match = db.get(Match, match_id)
    if match is None:
        raise HTTPException(404, detail="match not found")
    _ensure_player(match, current.id)
    try:
        match_engine.finalize_round(
            db,
            match=match,
            user_id=current.id,
            round_number=round_number,
            override=payload.override,
        )
    except match_engine.NotYourTurn as e:
        raise HTTPException(403, detail=str(e))
    except match_engine.MatchEngineError as e:
        raise HTTPException(409, detail=str(e))
    db.commit()
    db.refresh(match)
    out = _match_out(db, match, quran=request.app.state.quran)
    await request.app.state.connections.broadcast_match(
        match.id, {"type": "state", "match": out.model_dump(mode="json")}
    )
    return out


# ─── Private matches via invite link ─────────────────────────────────────


@router.post("/private", response_model=InviteOut)
async def create_invite(
    payload: CreateInviteRequest,
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> InviteOut:
    if not current.memorized_juz and not current.memorized_surahs:
        raise HTTPException(400, detail="set your memorized juz'/surahs first")
    quran = request.app.state.quran
    invite = await request.app.state.invites.create(
        challenger_id=current.id, round_count=payload.round_count
    )
    return InviteOut(
        code=invite.code,
        url=f"/invite/{invite.code}",
        round_count=invite.round_count,
        challenger_id=current.id,
        challenger_name=current.display_name,
        challenger_rating=current.rating,
        challenger_juz_equivalent=round(_juz_equiv_for(current, quran), 2),
        challenger_memorized_juz=sorted(current.memorized_juz),
        challenger_memorized_surahs=sorted(current.memorized_surahs),
    )


@router.get("/private/{code}", response_model=InviteOut)
async def get_invite(
    code: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> InviteOut:
    invite = await request.app.state.invites.get(code)
    if invite is None:
        raise HTTPException(404, detail="invite not found or expired")
    challenger = db.get(User, invite.challenger_id)
    if challenger is None:
        raise HTTPException(404, detail="challenger no longer exists")
    quran = request.app.state.quran
    return InviteOut(
        code=invite.code,
        url=f"/invite/{invite.code}",
        round_count=invite.round_count,
        challenger_id=challenger.id,
        challenger_name=challenger.display_name,
        challenger_rating=challenger.rating,
        challenger_juz_equivalent=round(_juz_equiv_for(challenger, quran), 2),
        challenger_memorized_juz=sorted(challenger.memorized_juz),
        challenger_memorized_surahs=sorted(challenger.memorized_surahs),
    )


@router.post("/private/{code}/accept", response_model=AcceptInviteResponse)
async def accept_invite(
    code: str,
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AcceptInviteResponse:
    invite = await request.app.state.invites.consume(code)
    if invite is None:
        raise HTTPException(404, detail="invite not found or expired")
    if invite.challenger_id == current.id:
        raise HTTPException(400, detail="you can't accept your own invite")
    challenger = db.get(User, invite.challenger_id)
    if challenger is None:
        raise HTTPException(404, detail="challenger no longer exists")
    if not current.memorized_juz and not current.memorized_surahs:
        raise HTTPException(400, detail="set your memorized juz'/surahs first")

    match = match_engine.create_match(
        db,
        player_a_id=challenger.id,
        player_b_id=current.id,
        round_count=invite.round_count,
        is_private=True,
        invite_code=invite.code,
    )
    db.commit()

    await request.app.state.connections.send_to_user(
        challenger.id, {"type": "match_found", "match_id": match.id}
    )
    return AcceptInviteResponse(match_id=match.id)


@router.post("/private/{code}/cancel")
async def cancel_invite(
    code: str,
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
) -> dict:
    cancelled = await request.app.state.invites.cancel(code, current.id)
    return {"cancelled": cancelled}
