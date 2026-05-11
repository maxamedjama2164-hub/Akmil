from fastapi import APIRouter, HTTPException, Query, Request

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
