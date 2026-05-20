"""Solo practice — the server picks a random ayah from the user's memorized
set and returns a challenge based on the requested challenge_type.

Challenge types
  recite            — show start ayah, user must recite the next one (default)
  guess_surah       — show full ayah, user picks which surah it's from (4 choices)
  guess_ayah_number — show full ayah + surah name, user picks the ayah number (4 choices)
  guess_surah_number — show full ayah, user picks the surah NUMBER (4 choices)
  mutashabih        — show one of two similar/repeated ayahs, pick which location it belongs to
  mix               — backend randomly picks one of the above types
"""

import random
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.auth import get_current_user
from app.config import settings
from app.models import User
from app.schemas import SoloPickResponse, SurahChoice
from app.services.tiers import parse_memorized_csv

router = APIRouter(prefix="/api/solo", tags=["solo"])

CHALLENGE_TYPES = ["recite", "guess_surah", "guess_ayah_number", "guess_surah_number", "mutashabih"]
# mix only picks from user-memorized-set modes; mutashabih draws from global index
MIX_TYPES = ["recite", "guess_surah", "guess_ayah_number", "guess_surah_number"]


def _open_db():
    conn = sqlite3.connect(f"file:{settings.quran_db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _all_surahs(conn) -> list[tuple[int, str, str, int]]:
    """Return [(id, name_en, name_ar, ayat_count)] for all 114 surahs."""
    rows = conn.execute("SELECT id, name_en, name_ar, ayat_count FROM surah ORDER BY id").fetchall()
    return [(r["id"], r["name_en"], r["name_ar"], r["ayat_count"]) for r in rows]


def _pick_memorized_ayah(conn, mj: set[int], ms: set[int], exclude_last: bool = True) -> sqlite3.Row | None:
    """Pick a random ayah from the user's memorized set."""
    clauses, params = [], []
    if mj:
        ph = ",".join(["?"] * len(mj))
        clauses.append(f"a.juz IN ({ph})")
        params.extend(sorted(mj))
    if ms:
        ph = ",".join(["?"] * len(ms))
        clauses.append(f"a.surah IN ({ph})")
        params.extend(sorted(ms))
    where = " OR ".join(clauses)
    last_exc = "AND NOT (a.surah = 114 AND a.number = 6)" if exclude_last else ""
    sql = (
        "SELECT a.surah, a.number, a.text_uthmani, a.juz, "
        "       s.name_en, s.name_ar, s.ayat_count "
        "FROM ayah a JOIN surah s ON s.id = a.surah "
        f"WHERE ({where}) {last_exc} "
        "ORDER BY RANDOM() LIMIT 1"
    )
    return conn.execute(sql, params).fetchone()


def _surah_choices(all_surahs: list, correct_id: int, n_wrong: int = 3) -> list[SurahChoice]:
    """Build a shuffled list of 4 surah choices (1 correct + n_wrong wrong)."""
    correct = next((s for s in all_surahs if s[0] == correct_id), None)
    if correct is None:
        return []
    wrong_pool = [s for s in all_surahs if s[0] != correct_id]
    wrong = random.sample(wrong_pool, min(n_wrong, len(wrong_pool)))
    choices = [SurahChoice(surah_number=correct[0], name_en=correct[1], name_ar=correct[2])]
    choices += [SurahChoice(surah_number=s[0], name_en=s[1], name_ar=s[2]) for s in wrong]
    random.shuffle(choices)
    return choices


def _number_choices(correct: int, ayat_count: int, n_wrong: int = 3) -> list[int]:
    """Build a sorted list of 4 ayah-number choices (1 correct + n_wrong nearby wrong)."""
    # Prefer numbers close to the correct one so the question is non-trivial.
    radius = 5
    candidates = [
        n for n in range(max(1, correct - radius), min(ayat_count + 1, correct + radius + 1))
        if n != correct
    ]
    if len(candidates) < n_wrong:
        # Widen if surah is short
        candidates = [n for n in range(1, ayat_count + 1) if n != correct]
    wrong = random.sample(candidates, min(n_wrong, len(candidates)))
    return sorted([correct] + wrong)


@router.get("/pick", response_model=SoloPickResponse)
def random_pick(
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
    challenge_type: str = Query(default="recite"),
) -> SoloPickResponse:
    mj = parse_memorized_csv(current.memorized_juz_csv)
    ms = parse_memorized_csv(current.memorized_surahs_csv)
    if not mj and not ms:
        raise HTTPException(400, detail="set your memorized juz'/surahs first")

    if challenge_type == "mix":
        challenge_type = random.choice(MIX_TYPES)
    if challenge_type not in CHALLENGE_TYPES:
        raise HTTPException(400, detail=f"unknown challenge_type: {challenge_type!r}")

    conn = _open_db()
    try:
        all_surahs = _all_surahs(conn)
        row = _pick_memorized_ayah(conn, mj, ms, exclude_last=(challenge_type == "recite"))
    finally:
        conn.close()

    if row is None:
        raise HTTPException(404, detail="no eligible ayah in your memorized set")

    # ── Recite mode (existing behaviour) ──────────────────────────────────────
    if challenge_type == "recite":
        return SoloPickResponse(
            challenge_type="recite",
            surah=row["surah"],
            start_ayah=row["number"],
            start_ayah_text_uthmani=row["text_uthmani"],
            surah_name_en=row["name_en"],
            surah_name_ar=row["name_ar"],
        )

    # ── Shared quiz setup ─────────────────────────────────────────────────────
    correct_surah = row["surah"]
    correct_ayah  = row["number"]
    ayat_count    = row["ayat_count"]
    name_en       = row["name_en"]
    name_ar       = row["name_ar"]
    text_uthmani  = row["text_uthmani"]

    if challenge_type == "guess_surah":
        return SoloPickResponse(
            challenge_type="guess_surah",
            ayah_text_uthmani=text_uthmani,
            correct_surah_number=correct_surah,
            correct_surah_name_en=name_en,
            correct_surah_name_ar=name_ar,
            correct_ayah_number=correct_ayah,
            surah_choices=_surah_choices(all_surahs, correct_surah),
        )

    if challenge_type == "guess_surah_number":
        return SoloPickResponse(
            challenge_type="guess_surah_number",
            ayah_text_uthmani=text_uthmani,
            correct_surah_number=correct_surah,
            correct_surah_name_en=name_en,
            correct_surah_name_ar=name_ar,
            correct_ayah_number=correct_ayah,
            surah_choices=_surah_choices(all_surahs, correct_surah),
        )

    if challenge_type == "guess_ayah_number":
        return SoloPickResponse(
            challenge_type="guess_ayah_number",
            ayah_text_uthmani=text_uthmani,
            # Surah name IS shown — user only needs to guess the number
            quiz_surah_name_en=name_en,
            quiz_surah_name_ar=name_ar,
            correct_surah_number=correct_surah,
            correct_surah_name_en=name_en,
            correct_surah_name_ar=name_ar,
            correct_ayah_number=correct_ayah,
            number_choices=_number_choices(correct_ayah, ayat_count),
        )

    if challenge_type == "mutashabih":
        similarity = request.app.state.similarity

        # Find a "similar" (non-identical) pair where at least one member has a
        # preceding ayah (number > 1) so we can use it as context.
        pair = None
        for _ in range(10):
            candidate = similarity.random_similar_pair(similar_only=True)
            if candidate is None:
                break
            (cs1, cn1), (cs2, cn2), _ = candidate
            if cn1 > 1 or cn2 > 1:
                pair = candidate
                break

        if pair is None:
            raise HTTPException(503, detail="no eligible mutashabih pair found")

        (s1, n1), (s2, n2), _ = pair

        # Choose which member becomes the answer (needs number > 1).
        # If both qualify, pick randomly for variety.
        if n1 > 1 and n2 > 1:
            if random.random() < 0.5:
                answer_s, answer_n, other_s, other_n = s1, n1, s2, n2
            else:
                answer_s, answer_n, other_s, other_n = s2, n2, s1, n1
        elif n1 > 1:
            answer_s, answer_n, other_s, other_n = s1, n1, s2, n2
        else:
            answer_s, answer_n, other_s, other_n = s2, n2, s1, n1

        conn2 = _open_db()
        try:
            prec = conn2.execute(
                "SELECT a.text_uthmani FROM ayah a "
                "WHERE a.surah = ? AND a.number = ?",
                (answer_s, answer_n - 1),
            ).fetchone()
            r_answer = conn2.execute(
                "SELECT a.text_uthmani, s.name_en, s.name_ar "
                "FROM ayah a JOIN surah s ON s.id = a.surah "
                "WHERE a.surah = ? AND a.number = ?",
                (answer_s, answer_n),
            ).fetchone()
            r_other = conn2.execute(
                "SELECT a.text_uthmani, s.name_en, s.name_ar "
                "FROM ayah a JOIN surah s ON s.id = a.surah "
                "WHERE a.surah = ? AND a.number = ?",
                (other_s, other_n),
            ).fetchone()
        finally:
            conn2.close()

        if prec is None or r_answer is None or r_other is None:
            raise HTTPException(503, detail="ayah data unavailable for mutashabih pair")

        return SoloPickResponse(
            challenge_type="mutashabih",
            preceding_ayah_text_uthmani=prec["text_uthmani"],
            ayah_text_uthmani=r_answer["text_uthmani"],
            correct_surah_number=answer_s,
            correct_surah_name_en=r_answer["name_en"],
            correct_surah_name_ar=r_answer["name_ar"],
            correct_ayah_number=answer_n,
            peer_text_uthmani=r_other["text_uthmani"],
            peer_surah_number=other_s,
            peer_ayah_number=other_n,
            peer_surah_name_en=r_other["name_en"],
            peer_surah_name_ar=r_other["name_ar"],
            similarity_type="similar",
        )

    raise HTTPException(400, detail="unhandled challenge_type")
