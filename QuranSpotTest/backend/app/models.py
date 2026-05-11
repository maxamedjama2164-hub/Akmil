from datetime import datetime

from sqlalchemy import (
    Boolean,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base
from app.services.tiers import parse_memorized_csv, serialize_memorized


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    # Comma-separated juz numbers, e.g. "1,2,3,30". Empty string = none yet.
    memorized_juz_csv: Mapped[str] = mapped_column(
        String, nullable=False, default=""
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    ratings: Mapped[list["Rating"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def memorized_juz(self) -> set[int]:
        return parse_memorized_csv(self.memorized_juz_csv)

    @memorized_juz.setter
    def memorized_juz(self, value: set[int]) -> None:
        self.memorized_juz_csv = serialize_memorized(set(value))


class Rating(Base):
    __tablename__ = "ratings"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    tier: Mapped[str] = mapped_column(String, primary_key=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False, default=1200)
    games_played: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="ratings")


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_a_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    player_b_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    tier: Mapped[str] = mapped_column(String, nullable=False)
    round_count: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    # "in_progress" | "completed" | "abandoned"
    status: Mapped[str] = mapped_column(String, nullable=False, default="in_progress")
    a_wins: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    b_wins: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    a_rating_before: Mapped[int | None] = mapped_column(Integer, nullable=True)
    a_rating_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    b_rating_before: Mapped[int | None] = mapped_column(Integer, nullable=True)
    b_rating_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    invite_code: Mapped[str | None] = mapped_column(
        String, unique=True, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)

    rounds: Mapped[list["Round"]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
        order_by="Round.number",
    )


class Round(Base):
    __tablename__ = "rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id"), nullable=False, index=True
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    picker_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reciter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    # Filled when the picker chooses an ayah:
    surah: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_ayah: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_ayat_csv: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Filled after the reciter uploads + scoring runs:
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    reason: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    picked_at: Mapped[datetime | None] = mapped_column(nullable=True)
    scored_at: Mapped[datetime | None] = mapped_column(nullable=True)

    match: Mapped[Match] = relationship(back_populates="rounds")

    __table_args__ = (UniqueConstraint("match_id", "number", name="uq_round_number"),)

    @property
    def status(self) -> str:
        if self.transcript is not None:
            return "scored"
        if self.surah is not None:
            return "picked"
        return "waiting_for_pick"
