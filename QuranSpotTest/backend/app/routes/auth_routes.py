from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
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
    serialize_memorized,
    tier_for_memorized,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_to_out(user: User) -> UserOut:
    memorized = user.memorized_juz
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        memorized_juz=sorted(memorized),
        tier=tier_for_memorized(memorized),
        created_at=user.created_at,
    )


@router.post("/signup", response_model=AuthResponse)
def signup(
    payload: SignupRequest,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    memorized = {int(j) for j in payload.memorized_juz}
    if not memorized:
        raise HTTPException(400, detail="memorized_juz must include at least one juz")
    if not all(is_valid_juz(j) for j in memorized):
        raise HTTPException(400, detail="memorized_juz contains values outside 1..30")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        memorized_juz_csv=serialize_memorized(memorized),
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
    return AuthResponse(token=create_access_token(user.id), user=_user_to_out(user))


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return AuthResponse(token=create_access_token(user.id), user=_user_to_out(user))


@router.get("/me", response_model=UserOut)
def me(current: Annotated[User, Depends(get_current_user)]) -> UserOut:
    return _user_to_out(current)
