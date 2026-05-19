from fastapi import APIRouter, HTTPException, Query, Request

from app.services.quran_foundation_api import get_verse_info

router = APIRouter(prefix="/api/quran", tags=["quran"])


@router.get("/surahs")
def list_surahs(request: Request) -> list[dict]:
    quran = request.app.state.quran
    return [
        {
            "id": s.id,
            "name_ar": s.name_ar,
            "name_en": s.name_en,
            "ayat_count": s.ayat_count,
            "juz_min": s.juz_min,
            "juz_max": s.juz_max,
        }
        for s in quran.list_surahs()
    ]


@router.get("/surah/{n}")
def list_ayat(
    request: Request,
    n: int,
    juz_min: int = Query(1, ge=1, le=30),
    juz_max: int = Query(30, ge=1, le=30),
) -> dict:
    if not (1 <= n <= 114):
        raise HTTPException(status_code=400, detail="surah out of range (1..114)")
    if juz_min > juz_max:
        raise HTTPException(status_code=400, detail="juz_min must be <= juz_max")

    quran = request.app.state.quran
    ayat = quran.list_ayat(n, juz_min=juz_min, juz_max=juz_max)
    return {
        "surah": n,
        "juz_min": juz_min,
        "juz_max": juz_max,
        "ayat": [
            {
                "number": a.number,
                "juz": a.juz,
                "text_uthmani": a.text_uthmani,
                "text_simple": a.text_simple,
            }
            for a in ayat
        ],
    }


@router.get("/surah/{n}/similarity")
def surah_similarity(request: Request, n: int) -> dict[str, str]:
    """Return sparse {ayah_number: "repeated"|"similar"} for a surah.

    Only ayat with a non-null status are included.
    """
    if not (1 <= n <= 114):
        raise HTTPException(status_code=400, detail="surah out of range (1..114)")
    return {str(k): v for k, v in request.app.state.similarity.surah_statuses(n).items()}


@router.get("/verse/{surah}/{ayah}/info")
async def verse_info(surah: int, ayah: int) -> dict:
    """Fetch per-verse enrichment from the Quran Foundation API (quran.com v4).

    Returns English translation (Saheeh International), Mushaf page, juz,
    hizb, and sajdah type.
    """
    if not (1 <= surah <= 114):
        raise HTTPException(status_code=400, detail="surah out of range")
    if ayah < 1:
        raise HTTPException(status_code=400, detail="ayah must be >= 1")
    return await get_verse_info(surah, ayah)
