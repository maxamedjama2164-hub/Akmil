"""Match lifecycle: create → pick → submit-recording → finalize → complete.

All DB writes happen here so routes stay thin. ELO is unified per user;
no per-tier rating bookkeeping.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Match, Round, User
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


def create_match(
    db: Session,
    *,
    player_a_id: int,
    player_b_id: int,
    round_count: int = 3,
    is_private: bool = False,
    invite_code: str | None = None,
) -> Match:
    if round_count < 1 or round_count > 9:
        raise ValueError("round_count must be 1..9")

    a = db.get(User, player_a_id)
    b = db.get(User, player_b_id)
    if a is None or b is None:
        raise MatchEngineError("one or both players no longer exist")

    match = Match(
        player_a_id=player_a_id,
        player_b_id=player_b_id,
        round_count=round_count,
        status="in_progress",
        a_rating_before=a.rating,
        b_rating_before=b.rating,
        is_private=is_private,
        invite_code=invite_code,
    )
    db.add(match)
    db.flush()

    for n in range(1, round_count + 1):
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
    """The first round that isn't finalized yet, or None when all are done."""
    for r in sorted(match.rounds, key=lambda r: r.number):
        if not r.finalized:
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

    picked_ayah = quran.get_ayah(surah, start_ayah)
    if picked_ayah is None:
        raise InvalidPick("ayah not found")
    reciter = db.get(User, cur.reciter_id)
    if reciter is None:
        raise MatchEngineError("reciter no longer exists")
    memorized_juz = parse_memorized_csv(reciter.memorized_juz_csv)
    memorized_surahs = parse_memorized_csv(reciter.memorized_surahs_csv)
    if not quran.is_ayah_memorized(
        surah, start_ayah, memorized_juz, memorized_surahs
    ):
        raise InvalidPick(
            f"ayah {surah}:{start_ayah} is outside the reciter's memorized set"
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
    search_override: tuple[float, bool] | None = None,
) -> Round:
    """Score the current round given an ASR transcript (no finalization yet).

    search_override: (accuracy, passed) from search-based validation. When
    provided and the base Levenshtein score failed, the override values are
    used so that ASR spelling variants don't unfairly penalise the reciter.
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

    target_words = normalize(cur.target_text or "")
    asr_words = normalize(transcript)
    score = score_round(target_words, asr_words)

    final_accuracy = score.accuracy
    final_passed   = score.passed
    if search_override is not None and not score.passed:
        final_accuracy, final_passed = search_override

    cur.transcript = transcript
    cur.accuracy   = final_accuracy
    cur.passed     = final_passed
    cur.reason     = score.reason
    cur.scored_at  = _now()
    db.flush()
    return cur


def finalize_round(
    db: Session,
    *,
    match: Match,
    user_id: int,
    round_number: int,
    override: bool,
) -> tuple[Round, bool]:
    """Mark a scored round as finalized — the picker is the sole gate."""
    if match.status != "in_progress":
        raise MatchEngineError("match is not in progress")

    cur = next(
        (r for r in match.rounds if r.number == round_number),
        None,
    )
    if cur is None:
        raise MatchEngineError("round not found")
    if cur.picker_id != user_id:
        raise NotYourTurn("only the round's picker can finalize it")
    if cur.transcript is None:
        raise MatchEngineError("round has not been scored yet")
    if cur.finalized:
        raise MatchEngineError("round already finalized")

    cur.overridden = bool(override) and not cur.passed
    cur.finalized = True
    cur.finalized_at = _now()

    if cur.passed or cur.overridden:
        winner_id = cur.reciter_id
    else:
        winner_id = cur.picker_id
    if winner_id == match.player_a_id:
        match.a_wins += 1
    else:
        match.b_wins += 1

    db.flush()

    if current_round(match) is None:
        _complete(db, match)
        return cur, True
    return cur, False


def _complete(db: Session, match: Match) -> None:
    """Finalize the match: unified ELO update + status flip."""
    if match.a_wins > match.b_wins:
        score_a = 1.0
    elif match.a_wins < match.b_wins:
        score_a = 0.0
    else:
        score_a = 0.5

    a = db.get(User, match.player_a_id)
    b = db.get(User, match.player_b_id)
    if a is None or b is None:
        raise MatchEngineError("player vanished mid-match")

    new_a, new_b = elo.update_pair(
        a.rating,
        b.rating,
        score_a=score_a,
        games_a=a.games_played,
        games_b=b.games_played,
    )

    match.a_rating_after = new_a
    match.b_rating_after = new_b
    a.rating = new_a
    b.rating = new_b
    a.games_played += 1
    b.games_played += 1

    match.status = "completed"
    match.completed_at = _now()
    db.flush()
