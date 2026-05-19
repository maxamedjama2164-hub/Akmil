"""Read-only access to data/quran.sqlite + the build_target helper used
to construct the reciter's expected continuation given a picked ayah.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

# The reciter must say the next single ayah in full. We don't cap on words —
# even Baqarah 282 (~130 words) is acceptable as the full target.
MAX_AYAT_PER_TARGET = 1
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

    def count_memorized_ayat(
        self,
        memorized_juz: set[int],
        memorized_surahs: set[int],
    ) -> int:
        """Count of unique ayat covered by (memorized juz ∪ memorized surahs).

        SQLite handles the de-duplication via UNION semantics naturally —
        we use OR with COUNT(*) which counts each ayah row once.
        """
        if not memorized_juz and not memorized_surahs:
            return 0
        clauses: list[str] = []
        params: list[int] = []
        if memorized_juz:
            placeholders = ",".join(["?"] * len(memorized_juz))
            clauses.append(f"juz IN ({placeholders})")
            params.extend(sorted(memorized_juz))
        if memorized_surahs:
            placeholders = ",".join(["?"] * len(memorized_surahs))
            clauses.append(f"surah IN ({placeholders})")
            params.extend(sorted(memorized_surahs))
        sql = "SELECT COUNT(*) FROM ayah WHERE " + " OR ".join(clauses)
        with self._conn() as c:
            row = c.execute(sql, params).fetchone()
        return int(row[0])

    def is_ayah_memorized(
        self,
        surah: int,
        ayah_number: int,
        memorized_juz: set[int],
        memorized_surahs: set[int],
    ) -> bool:
        """True if a given ayah falls inside the user's declared memorization."""
        if surah in memorized_surahs:
            return True
        ayah = self.get_ayah(surah, ayah_number)
        if ayah is None:
            return False
        return ayah.juz in memorized_juz

    def compute_juz_equivalent(
        self,
        memorized_juz: set[int],
        memorized_surahs: set[int],
    ) -> float:
        """Accurately compute juz-equivalents.

        Rule: each selected whole juz counts as EXACTLY 1.0 juz.
        Individual surahs add only the ayat that fall outside those juz.
        This fixes the bug where juz 30 (564 ayat) showed as ~2.7 juz
        because the uniform average (207 ayat/juz) was used for everything.
        """
        whole = float(len(memorized_juz))
        if not memorized_surahs:
            return whole

        with self._conn() as conn:
            if memorized_juz:
                juz_ph   = ",".join("?" * len(memorized_juz))
                surah_ph = ",".join("?" * len(memorized_surahs))
                row = conn.execute(
                    f"SELECT COUNT(*) FROM ayah "
                    f"WHERE surah IN ({surah_ph}) AND juz NOT IN ({juz_ph})",
                    [*sorted(memorized_surahs), *sorted(memorized_juz)],
                ).fetchone()
            else:
                surah_ph = ",".join("?" * len(memorized_surahs))
                row = conn.execute(
                    f"SELECT COUNT(*) FROM ayah WHERE surah IN ({surah_ph})",
                    sorted(memorized_surahs),
                ).fetchone()

        from app.services.tiers import AYAT_PER_JUZ
        extra_ayat = int(row[0])
        return whole + extra_ayat / AYAT_PER_JUZ

    def build_target(
        self,
        surah: int,
        start_ayah: int,
        max_ayat: int = MAX_AYAT_PER_TARGET,
    ) -> Target:
        """Build the text the reciter must produce after the picked ayah.

        Walks forward starting at (surah, start_ayah + 1), crossing surah
        boundaries if necessary, until `max_ayat` ayat are collected. At
        end of Quran we just stop early — the caller is responsible for
        not picking the literal last ayah of An-Nas.
        """
        ayat: list[Ayah] = []
        s, a = surah, start_ayah + 1

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
            a += 1

        return Target(
            ayat=tuple(ayat),
            text_simple=" ".join(a.text_simple for a in ayat),
            text_uthmani=" ".join(a.text_uthmani for a in ayat),
        )
