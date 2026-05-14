"""Solo practice — the server picks a random ayah from the user's memorized
set and the frontend just shows it. Auth-required.
"""

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import get_current_user
from app.config import settings
from app.models import User
from app.schemas import SoloPickResponse
from app.services.tiers import parse_memorized_csv

router = APIRouter(prefix="/api/solo", tags=["solo"])


@router.get("/pick", response_model=SoloPickResponse)
def random_pick(
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
) -> SoloPickResponse:
    mj = parse_memorized_csv(current.memorized_juz_csv)
    ms = parse_memorized_csv(current.memorized_surahs_csv)
    if not mj and not ms:
        raise HTTPException(
            400, detail="set your memorized juz'/surahs first"
        )

    # Random ayah from (memorized juz ∪ memorized surahs), excluding the
    # last ayah of the Quran (114:6) which has no continuation.
    clauses: list[str] = []
    params: list[int] = []
    if mj:
        ph = ",".join(["?"] * len(mj))
        clauses.append(f"a.juz IN ({ph})")
        params.extend(sorted(mj))
    if ms:
        ph = ",".join(["?"] * len(ms))
        clauses.append(f"a.surah IN ({ph})")
        params.extend(sorted(ms))
    where = " OR ".join(clauses)

    sql = (
        "SELECT a.surah, a.number, a.text_uthmani, "
        "       s.name_en, s.name_ar "
        "FROM ayah a JOIN surah s ON s.id = a.surah "
        f"WHERE ({where}) AND NOT (a.surah = 114 AND a.number = 6) "
        "ORDER BY RANDOM() LIMIT 1"
    )

    conn = sqlite3.connect(f"file:{settings.quran_db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(sql, params).fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(
            404, detail="no eligible ayah in your memorized set"
        )

    return SoloPickResponse(
        surah=row["surah"],
        start_ayah=row["number"],
        start_ayah_text_uthmani=row["text_uthmani"],
        surah_name_en=row["name_en"],
        surah_name_ar=row["name_ar"],
    )
