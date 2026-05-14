from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.db import get_db
from app.models import User
from app.schemas import AuthResponse, LoginRequest, SignupRequest, UserOut
from app.services.tiers import (
    is_valid_juz,
    is_valid_surah,
    juz_equivalents_for_ayat,
    serialize_memorized,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_to_out(user: User, request: Request) -> UserOut:
    quran = request.app.state.quran
    mj = user.memorized_juz
    ms = user.memorized_surahs
    ayat_count = quran.count_memorized_ayat(mj, ms)
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        memorized_juz=sorted(mj),
        memorized_surahs=sorted(ms),
        memorized_ayat_count=ayat_count,
        juz_equivalent=round(juz_equivalents_for_ayat(ayat_count), 2),
        rating=user.rating,
        games_played=user.games_played,
        created_at=user.created_at,
    )


@router.post("/signup", response_model=AuthResponse)
def signup(
    payload: SignupRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    memorized_juz = {int(j) for j in payload.memorized_juz}
    memorized_surahs = {int(s) for s in payload.memorized_surahs}
    if not memorized_juz and not memorized_surahs:
        raise HTTPException(
            400, detail="select at least one juz or surah you've memorized"
        )
    if not all(is_valid_juz(j) for j in memorized_juz):
        raise HTTPException(400, detail="memorized_juz contains values outside 1..30")
    if not all(is_valid_surah(s) for s in memorized_surahs):
        raise HTTPException(
            400, detail="memorized_surahs contains values outside 1..114"
        )

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        memorized_juz_csv=serialize_memorized(memorized_juz),
        memorized_surahs_csv=serialize_memorized(memorized_surahs),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    db.refresh(user)
    return AuthResponse(
        token=create_access_token(user.id), user=user_to_out(user, request)
    )


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return AuthResponse(
        token=create_access_token(user.id), user=user_to_out(user, request)
    )


@router.get("/me", response_model=UserOut)
def me(
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
) -> UserOut:
    return user_to_out(current, request)
