from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=40)
    # Set of juz' (1..30) the user has memorized. At least 1.
    memorized_juz: list[int] = Field(min_length=1)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    display_name: str
    memorized_juz: list[int]
    tier: str
    created_at: datetime


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class RatingOut(BaseModel):
    tier: str
    rating: int
    games_played: int


class QuickmatchRequest(BaseModel):
    round_count: int = Field(default=3, ge=1, le=9)


class PickRequest(BaseModel):
    surah: int = Field(ge=1, le=114)
    start_ayah: int = Field(ge=1)


class RoundOut(BaseModel):
    number: int
    picker_id: int
    reciter_id: int
    status: str
    surah: int | None = None
    start_ayah: int | None = None
    target_text: str | None = None
    target_ayat: list[dict] | None = None  # [{surah, number}, ...]
    transcript: str | None = None
    accuracy: float | None = None
    passed: bool | None = None
    reason: str | None = None


class MatchPlayerOut(BaseModel):
    id: int
    display_name: str
    memorized_juz: list[int]
    tier: str


class MatchOut(BaseModel):
    id: int
    status: str
    tier: str
    round_count: int
    player_a: MatchPlayerOut
    player_b: MatchPlayerOut
    a_wins: int
    b_wins: int
    a_rating_before: int | None
    b_rating_before: int | None
    a_rating_after: int | None
    b_rating_after: int | None
    rounds: list[RoundOut]
    is_private: bool
    created_at: datetime
    completed_at: datetime | None = None


class QuickmatchResponse(BaseModel):
    status: str  # "matched" | "queued"
    match_id: int | None = None
    queue_position: int | None = None
    tier: str
