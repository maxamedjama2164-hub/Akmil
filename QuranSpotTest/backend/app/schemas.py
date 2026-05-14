from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=40)
    memorized_juz: list[int] = []
    memorized_surahs: list[int] = []


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    display_name: str
    memorized_juz: list[int]
    memorized_surahs: list[int]
    memorized_ayat_count: int
    juz_equivalent: float
    rating: int
    games_played: int
    created_at: datetime


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class CoverageRequest(BaseModel):
    memorized_juz: list[int] = []
    memorized_surahs: list[int] = []


class CoverageResponse(BaseModel):
    memorized_ayat_count: int
    juz_equivalent: float


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
    start_ayah_text_uthmani: str | None = None
    target_text: str | None = None
    target_ayat: list[dict] | None = None
    transcript: str | None = None
    accuracy: float | None = None
    passed: bool | None = None
    reason: str | None = None
    finalized: bool = False
    overridden: bool = False
    winner_id: int | None = None


class MatchPlayerOut(BaseModel):
    id: int
    display_name: str
    memorized_juz: list[int]
    memorized_surahs: list[int]
    juz_equivalent: float
    rating: int


class MatchOut(BaseModel):
    id: int
    status: str
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


class FinalizeRequest(BaseModel):
    override: bool = False


class CreateInviteRequest(BaseModel):
    round_count: int = Field(default=3, ge=1, le=9)


class InviteOut(BaseModel):
    code: str
    url: str
    round_count: int
    challenger_id: int
    challenger_name: str
    challenger_rating: int
    challenger_juz_equivalent: float
    challenger_memorized_juz: list[int] = []
    challenger_memorized_surahs: list[int] = []


class AcceptInviteResponse(BaseModel):
    match_id: int


class SoloPickResponse(BaseModel):
    surah: int
    start_ayah: int
    start_ayah_text_uthmani: str
    surah_name_en: str
    surah_name_ar: str
