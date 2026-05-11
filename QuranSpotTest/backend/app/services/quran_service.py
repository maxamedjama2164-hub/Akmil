"""Read-only access to data/quran.sqlite + the build_target helper used
to construct the reciter's expected continuation given a picked ayah.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

MAX_AYAT_PER_TARGET = 2
MAX_WORDS_PER_TARGET = 25
LAST_SURAH = 114


@dataclass(frozen=True)
class Ayah:
    surah: int
    number: int
    juz: int
    text_uthmani: str
    text_simple: str


@dataclass(frozen=True)
class Surah:
    id: int
    name_ar: str
    name_en: str
    ayat_count: int
    juz_min: int
    juz_max: int


@dataclass(frozen=True)
class Target:
    ayat: tuple[Ayah, ...]
    text_simple: str
    text_uthmani: str

    @property
    def ayat_list(self) -> list[dict]:
        return [{"surah": a.surah, "number": a.number} for a in self.ayat]


class QuranService:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = Path(db_path or settings.quran_db_path)
        if not self.db_path.exists():
            raise FileNotFoundError(
                f"quran.sqlite not found at {self.db_path}; "
                "run backend/scripts/build_quran_db.py"
            )

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        c.row_factory = sqlite3.Row
        return c

    def list_surahs(self) -> list[Surah]:
        with self._conn() as c:
            rows = c.execute("SELECT * FROM surah ORDER BY id").fetchall()
        return [Surah(**dict(r)) for r in rows]

    def list_ayat(
        self, surah: int, juz_min: int = 1, juz_max: int = 30
    ) -> list[Ayah]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT surah, number, juz, text_uthmani, text_simple "
                "FROM ayah WHERE surah = ? AND juz BETWEEN ? AND ? "
                "ORDER BY number",
                (surah, juz_min, juz_max),
            ).fetchall()
        return [Ayah(**dict(r)) for r in rows]

    def get_ayah(self, surah: int, number: int) -> Ayah | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT surah, number, juz, text_uthmani, text_simple "
                "FROM ayah WHERE surah = ? AND number = ?",
                (surah, number),
            ).fetchone()
        return Ayah(**dict(row)) if row else None

    def build_target(
        self,
        surah: int,
        start_ayah: int,
        max_ayat: int = MAX_AYAT_PER_TARGET,
        max_words: int = MAX_WORDS_PER_TARGET,
    ) -> Target:
        """Build the text the reciter must produce after the picked ayah.

        Walks forward starting at (surah, start_ayah + 1), crossing surah
        boundaries if necessary, until `max_ayat` ayat are collected or
        the running word count meets/exceeds `max_words`. At end of Quran
        we just stop early — the caller is responsible for not picking
        the literal last ayah of An-Nas.
        """
        ayat: list[Ayah] = []
        s, a = surah, start_ayah + 1
        word_count = 0

        while len(ayat) < max_ayat:
            ayah = self.get_ayah(s, a)
            if ayah is None:
                if s >= LAST_SURAH:
                    break
                s += 1
                a = 1
                ayah = self.get_ayah(s, a)
                if ayah is None:
                    break

            ayat.append(ayah)
            word_count += len(ayah.text_simple.split())
            if word_count >= max_words:
                break
            a += 1

        return Target(
            ayat=tuple(ayat),
            text_simple=" ".join(a.text_simple for a in ayat),
            text_uthmani=" ".join(a.text_uthmani for a in ayat),
        )
