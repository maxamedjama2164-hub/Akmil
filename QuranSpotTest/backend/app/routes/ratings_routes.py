from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import Rating, User
from app.schemas import RatingOut
from app.services import elo as elo_mod
from app.services.tiers import ALL_TIER_LABELS, tier_for_memorized

router = APIRouter(prefix="/api/ratings", tags=["ratings"])


@router.get("/me", response_model=list[RatingOut])
def my_ratings(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[RatingOut]:
    """Return ratings for every tier, including unplayed ones (default 1200,
    games=0). The user's current eligibility tier comes first.
    """
    eligibility = tier_for_memorized(current.memorized_juz)
    existing = {
        r.tier: r
        for r in db.query(Rating).filter(Rating.user_id == current.id).all()
    }

    order = [eligibility] + [t for t in ALL_TIER_LABELS if t != eligibility]
    out: list[RatingOut] = []
    for tier in order:
        r = existing.get(tier)
        out.append(
            RatingOut(
                tier=tier,
                rating=r.rating if r else elo_mod.DEFAULT_RATING,
                games_played=r.games_played if r else 0,
            )
        )
    return out
