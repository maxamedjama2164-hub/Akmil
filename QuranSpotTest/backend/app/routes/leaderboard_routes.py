from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas import LeaderboardEntry, LeaderboardResponse

router = APIRouter(prefix="/api", tags=["leaderboard"])


@router.get("/leaderboard", response_model=LeaderboardResponse)
def leaderboard(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 50,
) -> LeaderboardResponse:
    """Public leaderboard — no auth required."""
    quran = request.app.state.quran

    total = db.query(User).filter(User.games_played > 0).count()

    users = (
        db.query(User)
        .filter(User.games_played > 0)
        .order_by(User.rating.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )

    entries = [
        LeaderboardEntry(
            rank=i + 1,
            id=u.id,
            display_name=u.display_name,
            rating=u.rating,
            games_played=u.games_played,
            memorized_ayat_count=quran.count_memorized_ayat(u.memorized_juz, u.memorized_surahs),
            juz_equivalent=round(
                quran.compute_juz_equivalent(u.memorized_juz, u.memorized_surahs),
                2,
            ),
        )
        for i, u in enumerate(users)
    ]

    return LeaderboardResponse(entries=entries, total_players=total)
