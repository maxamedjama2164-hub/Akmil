"""Match lifecycle: create → pick → submit-recording → complete.

All DB writes happen here so routes stay thin. ELO update is applied once
the final round is scored.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Match, Rating, Round, User
from app.services import elo
from app.services.normalizer import normalize
from app.services.quran_service import QuranService
from app.services.scorer import score_round
from app.services.tiers import parse_memorized_csv


class MatchEngineError(Exception):
    pass


class NotYourTurn(MatchEngineError):
    pass


class InvalidPick(MatchEngineError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_or_create_rating(db: Session, user_id: int, tier: str) -> Rating:
    rating = db.get(Rating, (user_id, tier))
    if rating is None:
        rating = Rating(
            user_id=user_id, tier=tier, rating=elo.DEFAULT_RATING, games_played=0
        )
        db.add(rating)
        db.flush()
    return rating


def create_match(
    db: Session,
    *,
    player_a_id: int,
    player_b_id: int,
    tier: str,
    round_count: int = 3,
    is_private: bool = False,
    invite_code: str | None = None,
) -> Match:
    if round_count < 1 or round_count > 9:
        raise ValueError("round_count must be 1..9")

    rating_a = get_or_create_rating(db, player_a_id, tier)
    rating_b = get_or_create_rating(db, player_b_id, tier)

    match = Match(
        player_a_id=player_a_id,
        player_b_id=player_b_id,
        tier=tier,
        round_count=round_count,
        status="in_progress",
        a_rating_before=rating_a.rating,
        b_rating_before=rating_b.rating,
        is_private=is_private,
        invite_code=invite_code,
    )
    db.add(match)
    db.flush()

    for n in range(1, round_count + 1):
        # Round 1: A picks, B recites. Then alternate.
        if n % 2 == 1:
            picker_id, reciter_id = player_a_id, player_b_id
        else:
            picker_id, reciter_id = player_b_id, player_a_id
        db.add(
            Round(
                match_id=match.id,
                number=n,
                picker_id=picker_id,
                reciter_id=reciter_id,
            )
        )
    db.flush()
    db.refresh(match)
    return match


def current_round(match: Match) -> Round | None:
    """The first round that hasn't been scored yet, or None when match is done."""
    for r in sorted(match.rounds, key=lambda r: r.number):
        if r.status != "scored":
            return r
    return None


def pick(
    db: Session,
    quran: QuranService,
    *,
    match: Match,
    user_id: int,
    surah: int,
    start_ayah: int,
) -> Round:
    if match.status != "in_progress":
        raise MatchEngineError("match is not in progress")
    cur = current_round(match)
    if cur is None:
        raise MatchEngineError("no rounds left to pick")
    if cur.picker_id != user_id:
        raise NotYourTurn("it's not your turn to pick")
    if cur.surah is not None:
        raise MatchEngineError("pick already made for this round")

    if not (1 <= surah <= 114):
        raise InvalidPick("surah out of range")
    surah_meta = next((s for s in quran.list_surahs() if s.id == surah), None)
    if surah_meta is None or not (1 <= start_ayah <= surah_meta.ayat_count):
        raise InvalidPick("ayah out of range")

    # The picked ayah must belong to one of the reciter's memorized juz'.
    picked_ayah = quran.get_ayah(surah, start_ayah)
    if picked_ayah is None:
        raise InvalidPick("ayah not found")
    reciter = db.get(User, cur.reciter_id)
    if reciter is None:
        raise MatchEngineError("reciter no longer exists")
    memorized = parse_memorized_csv(reciter.memorized_juz_csv)
    if picked_ayah.juz not in memorized:
        raise InvalidPick(
            f"juz {picked_ayah.juz} is outside the reciter's memorized set"
        )

    target = quran.build_target(surah, start_ayah)
    if not target.ayat:
        raise InvalidPick(
            "no continuation possible (ayah is at the end of the Quran)"
        )

    cur.surah = surah
    cur.start_ayah = start_ayah
    cur.target_text = target.text_uthmani
    cur.target_ayat_csv = ",".join(f"{a.surah}:{a.number}" for a in target.ayat)
    cur.picked_at = _now()
    db.flush()
    return cur


def submit_score(
    db: Session,
    *,
    match: Match,
    user_id: int,
    transcript: str,
) -> tuple[Round, bool]:
    """Apply scoring to the current round given an ASR transcript.

    Returns `(round, match_completed)`. Caller is responsible for ensuring
    the audio belonged to this user before calling.
    """
    if match.status != "in_progress":
        raise MatchEngineError("match is not in progress")
    cur = current_round(match)
    if cur is None:
        raise MatchEngineError("no rounds left")
    if cur.reciter_id != user_id:
        raise NotYourTurn("you are not the reciter for this round")
    if cur.surah is None:
        raise MatchEngineError("picker hasn't picked yet")
    if cur.transcript is not None:
        raise MatchEngineError("round already scored")

    # Rebuild target tokens from the stored target_text so we don't have to
    # round-trip through the QuranService here.
    target_words = normalize(cur.target_text or "")
    asr_words = normalize(transcript)
    score = score_round(target_words, asr_words)

    cur.transcript = transcript
    cur.accuracy = score.accuracy
    cur.passed = score.passed
    cur.reason = score.reason
    cur.scored_at = _now()

    # Reciter wins iff passed. Picker wins otherwise.
    if score.passed:
        if cur.reciter_id == match.player_a_id:
            match.a_wins += 1
        else:
            match.b_wins += 1
    else:
        if cur.picker_id == match.player_a_id:
            match.a_wins += 1
        else:
            match.b_wins += 1

    db.flush()

    if current_round(match) is None:
        _complete(db, match)
        return cur, True
    return cur, False


def _complete(db: Session, match: Match) -> None:
    """Finalize the match: ELO updates + status flip."""
    if match.a_wins > match.b_wins:
        score_a = 1.0
    elif match.a_wins < match.b_wins:
        score_a = 0.0
    else:
        score_a = 0.5

    rating_a = get_or_create_rating(db, match.player_a_id, match.tier)
    rating_b = get_or_create_rating(db, match.player_b_id, match.tier)
    new_a, new_b = elo.update_pair(
        rating_a.rating,
        rating_b.rating,
        score_a=score_a,
        games_a=rating_a.games_played,
        games_b=rating_b.games_played,
    )

    match.a_rating_after = new_a
    match.b_rating_after = new_b
    rating_a.rating = new_a
    rating_b.rating = new_b
    rating_a.games_played += 1
    rating_b.games_played += 1

    match.status = "completed"
    match.completed_at = _now()
    db.flush()
