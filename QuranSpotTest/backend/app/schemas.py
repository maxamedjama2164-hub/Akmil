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
    bio: str | None = None
    avatar_data: str | None = None


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


class SurahChoice(BaseModel):
    surah_number: int
    name_en: str
    name_ar: str


class SoloPickResponse(BaseModel):
    challenge_type: str = "recite"  # "recite" | "guess_surah" | "guess_ayah_number" | "guess_surah_number" | "mutashabih"

    # ── recite mode ───────────────────────────────────────────────────────────
    surah: int | None = None
    start_ayah: int | None = None
    start_ayah_text_uthmani: str | None = None
    surah_name_en: str = ""
    surah_name_ar: str = ""

    # ── quiz modes (shown to user) ─────────────────────────────────────────────
    ayah_text_uthmani: str | None = None
    # shown for guess_ayah_number only (user needs to know which surah):
    quiz_surah_name_en: str | None = None
    quiz_surah_name_ar: str | None = None

    # ── correct answers (sent to client — this is a practice app, not a test) ──
    correct_surah_number: int | None = None
    correct_surah_name_en: str | None = None
    correct_surah_name_ar: str | None = None
    correct_ayah_number: int | None = None

    # ── multiple-choice options ────────────────────────────────────────────────
    surah_choices: list[SurahChoice] = []   # for guess_surah + guess_surah_number
    number_choices: list[int] = []           # for guess_ayah_number

    # ── mutashabih mode ────────────────────────────────────────────────────────
    # Show ayah_text_uthmani (from above); user identifies which of two locations it belongs to.
    peer_text_uthmani: str | None = None    # the other similar ayah for context
    peer_surah_number: int | None = None
    peer_ayah_number: int | None = None
    peer_surah_name_en: str | None = None
    peer_surah_name_ar: str | None = None
    similarity_type: str | None = None     # "repeated" | "similar"


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=40)
    memorized_juz: list[int] | None = None
    memorized_surahs: list[int] | None = None
    bio: str | None = Field(default=None, max_length=200)
    avatar_data: str | None = None  # base64-encoded JPEG from client-side canvas


class LeaderboardEntry(BaseModel):
    rank: int
    id: int
    display_name: str
    rating: int
    games_played: int
    juz_equivalent: float
    memorized_ayat_count: int


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    total_players: int
