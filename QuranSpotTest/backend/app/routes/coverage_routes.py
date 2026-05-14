"""Live preview of a memorization selection's coverage.

Used by the signup form to show "X ayat memorized (Y juz equivalent)" while
the user is toggling juz and surah checkboxes — without having to replicate
the dedup math in the browser.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import CoverageRequest, CoverageResponse
from app.services.tiers import (
    is_valid_juz,
    is_valid_surah,
    juz_equivalents_for_ayat,
)

router = APIRouter(prefix="/api", tags=["coverage"])


@router.post("/coverage", response_model=CoverageResponse)
def coverage(
    payload: CoverageRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> CoverageResponse:
    juz = {int(j) for j in payload.memorized_juz if is_valid_juz(int(j))}
    surahs = {int(s) for s in payload.memorized_surahs if is_valid_surah(int(s))}
    quran = request.app.state.quran
    ayat = quran.count_memorized_ayat(juz, surahs)
    return CoverageResponse(
        memorized_ayat_count=ayat,
        juz_equivalent=round(juz_equivalents_for_ayat(ayat), 2),
    )
