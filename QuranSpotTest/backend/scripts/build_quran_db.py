"""Build a slim Quran SQLite from the Tarteel-ML JSON + embedded juz' / surah metadata.

Source: /Users/laithtahboub/QuranSpotTest/tarteel-ml/data/quran.json
Output: /Users/laithtahboub/QuranSpotTest/data/quran.sqlite

Schema:
  surah(id INTEGER PRIMARY KEY, name_ar TEXT, name_en TEXT, ayat_count INTEGER,
        juz_min INTEGER, juz_max INTEGER)
  ayah(surah INTEGER, number INTEGER, juz INTEGER,
       text_uthmani TEXT, text_simple TEXT,
       PRIMARY KEY (surah, number))
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_JSON = ROOT / "tarteel-ml" / "data" / "quran.json"
OUT_DB = ROOT / "data" / "quran.sqlite"

# (surah, ayah) where each juz' begins. Canonical Madani mushaf boundaries.
JUZ_STARTS: list[tuple[int, int]] = [
    (1, 1),    (2, 142),  (2, 253),  (3, 93),   (4, 24),
    (4, 148),  (5, 82),   (6, 111),  (7, 88),   (8, 41),
    (9, 94),   (11, 6),   (12, 53),  (15, 1),   (17, 1),
    (18, 75),  (21, 1),   (23, 1),   (25, 21),  (27, 56),
    (29, 46),  (33, 31),  (36, 28),  (39, 32),  (41, 47),
    (46, 1),   (51, 31),  (58, 1),   (67, 1),   (78, 1),
]

# 114 surah names (Arabic, English). Order = surah number.
SURAHS: list[tuple[str, str]] = [
    ("الفاتحة", "Al-Fatihah"), ("البقرة", "Al-Baqarah"), ("آل عمران", "Aal-i-Imran"),
    ("النساء", "An-Nisa"), ("المائدة", "Al-Ma'idah"), ("الأنعام", "Al-An'am"),
    ("الأعراف", "Al-A'raf"), ("الأنفال", "Al-Anfal"), ("التوبة", "At-Tawbah"),
    ("يونس", "Yunus"), ("هود", "Hud"), ("يوسف", "Yusuf"),
    ("الرعد", "Ar-Ra'd"), ("إبراهيم", "Ibrahim"), ("الحجر", "Al-Hijr"),
    ("النحل", "An-Nahl"), ("الإسراء", "Al-Isra"), ("الكهف", "Al-Kahf"),
    ("مريم", "Maryam"), ("طه", "Ta-Ha"), ("الأنبياء", "Al-Anbiya"),
    ("الحج", "Al-Hajj"), ("المؤمنون", "Al-Mu'minun"), ("النور", "An-Nur"),
    ("الفرقان", "Al-Furqan"), ("الشعراء", "Ash-Shu'ara"), ("النمل", "An-Naml"),
    ("القصص", "Al-Qasas"), ("العنكبوت", "Al-Ankabut"), ("الروم", "Ar-Rum"),
    ("لقمان", "Luqman"), ("السجدة", "As-Sajdah"), ("الأحزاب", "Al-Ahzab"),
    ("سبأ", "Saba"), ("فاطر", "Fatir"), ("يس", "Ya-Sin"),
    ("الصافات", "As-Saffat"), ("ص", "Sad"), ("الزمر", "Az-Zumar"),
    ("غافر", "Ghafir"), ("فصلت", "Fussilat"), ("الشورى", "Ash-Shuraa"),
    ("الزخرف", "Az-Zukhruf"), ("الدخان", "Ad-Dukhan"), ("الجاثية", "Al-Jathiyah"),
    ("الأحقاف", "Al-Ahqaf"), ("محمد", "Muhammad"), ("الفتح", "Al-Fath"),
    ("الحجرات", "Al-Hujurat"), ("ق", "Qaf"), ("الذاريات", "Adh-Dhariyat"),
    ("الطور", "At-Tur"), ("النجم", "An-Najm"), ("القمر", "Al-Qamar"),
    ("الرحمن", "Ar-Rahman"), ("الواقعة", "Al-Waqi'ah"), ("الحديد", "Al-Hadid"),
    ("المجادلة", "Al-Mujadila"), ("الحشر", "Al-Hashr"), ("الممتحنة", "Al-Mumtahanah"),
    ("الصف", "As-Saff"), ("الجمعة", "Al-Jumu'ah"), ("المنافقون", "Al-Munafiqun"),
    ("التغابن", "At-Taghabun"), ("الطلاق", "At-Talaq"), ("التحريم", "At-Tahrim"),
    ("الملك", "Al-Mulk"), ("القلم", "Al-Qalam"), ("الحاقة", "Al-Haqqah"),
    ("المعارج", "Al-Ma'arij"), ("نوح", "Nuh"), ("الجن", "Al-Jinn"),
    ("المزمل", "Al-Muzzammil"), ("المدثر", "Al-Muddaththir"), ("القيامة", "Al-Qiyamah"),
    ("الإنسان", "Al-Insan"), ("المرسلات", "Al-Mursalat"), ("النبأ", "An-Naba"),
    ("النازعات", "An-Nazi'at"), ("عبس", "Abasa"), ("التكوير", "At-Takwir"),
    ("الانفطار", "Al-Infitar"), ("المطففين", "Al-Mutaffifin"), ("الانشقاق", "Al-Inshiqaq"),
    ("البروج", "Al-Buruj"), ("الطارق", "At-Tariq"), ("الأعلى", "Al-A'la"),
    ("الغاشية", "Al-Ghashiyah"), ("الفجر", "Al-Fajr"), ("البلد", "Al-Balad"),
    ("الشمس", "Ash-Shams"), ("الليل", "Al-Layl"), ("الضحى", "Ad-Duhaa"),
    ("الشرح", "Ash-Sharh"), ("التين", "At-Tin"), ("العلق", "Al-Alaq"),
    ("القدر", "Al-Qadr"), ("البينة", "Al-Bayyinah"), ("الزلزلة", "Az-Zalzalah"),
    ("العاديات", "Al-Adiyat"), ("القارعة", "Al-Qari'ah"), ("التكاثر", "At-Takathur"),
    ("العصر", "Al-Asr"), ("الهمزة", "Al-Humazah"), ("الفيل", "Al-Fil"),
    ("قريش", "Quraysh"), ("الماعون", "Al-Ma'un"), ("الكوثر", "Al-Kawthar"),
    ("الكافرون", "Al-Kafirun"), ("النصر", "An-Nasr"), ("المسد", "Al-Masad"),
    ("الإخلاص", "Al-Ikhlas"), ("الفلق", "Al-Falaq"), ("الناس", "An-Nas"),
]


def juz_for(surah: int, ayah: int) -> int:
    """Return the juz' (1..30) that the given (surah, ayah) belongs to."""
    juz = 1
    for i, (s, a) in enumerate(JUZ_STARTS, start=1):
        if (surah, ayah) >= (s, a):
            juz = i
        else:
            break
    return juz


def main() -> int:
    if not SRC_JSON.exists():
        print(f"ERROR: source JSON not found at {SRC_JSON}", file=sys.stderr)
        print("Expected the Tarteel-ML repo to be cloned at tarteel-ml/", file=sys.stderr)
        return 1

    if len(SURAHS) != 114:
        print(f"ERROR: SURAHS table has {len(SURAHS)} entries, expected 114", file=sys.stderr)
        return 1
    if len(JUZ_STARTS) != 30:
        print(f"ERROR: JUZ_STARTS has {len(JUZ_STARTS)} entries, expected 30", file=sys.stderr)
        return 1

    print(f"Loading {SRC_JSON}")
    with SRC_JSON.open(encoding="utf-8") as f:
        quran = json.load(f)

    OUT_DB.parent.mkdir(parents=True, exist_ok=True)
    if OUT_DB.exists():
        OUT_DB.unlink()

    print(f"Writing {OUT_DB}")
    con = sqlite3.connect(OUT_DB)
    try:
        cur = con.cursor()
        cur.executescript(
            """
            CREATE TABLE surah (
                id          INTEGER PRIMARY KEY,
                name_ar     TEXT NOT NULL,
                name_en     TEXT NOT NULL,
                ayat_count  INTEGER NOT NULL,
                juz_min     INTEGER NOT NULL,
                juz_max     INTEGER NOT NULL
            );
            CREATE TABLE ayah (
                surah         INTEGER NOT NULL,
                number        INTEGER NOT NULL,
                juz           INTEGER NOT NULL,
                text_uthmani  TEXT NOT NULL,
                text_simple   TEXT NOT NULL,
                PRIMARY KEY (surah, number)
            );
            CREATE INDEX idx_ayah_juz ON ayah(juz);
            """
        )

        ayah_rows: list[tuple[int, int, int, str, str]] = []
        surah_rows: list[tuple[int, str, str, int, int, int]] = []

        for s_num in range(1, 115):
            surah_obj = quran[str(s_num)]
            ayat_count = len(surah_obj)
            juz_values: list[int] = []
            for a_num in range(1, ayat_count + 1):
                ayah_obj = surah_obj[str(a_num)]
                uthmani = (ayah_obj.get("displayText") or "").strip("\r\n ")
                simple = (ayah_obj.get("text") or "").strip()
                j = juz_for(s_num, a_num)
                juz_values.append(j)
                ayah_rows.append((s_num, a_num, j, uthmani, simple))

            name_ar, name_en = SURAHS[s_num - 1]
            surah_rows.append(
                (s_num, name_ar, name_en, ayat_count, min(juz_values), max(juz_values))
            )

        cur.executemany(
            "INSERT INTO surah (id, name_ar, name_en, ayat_count, juz_min, juz_max) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            surah_rows,
        )
        cur.executemany(
            "INSERT INTO ayah (surah, number, juz, text_uthmani, text_simple) "
            "VALUES (?, ?, ?, ?, ?)",
            ayah_rows,
        )
        con.commit()

        n_surahs = cur.execute("SELECT COUNT(*) FROM surah").fetchone()[0]
        n_ayat = cur.execute("SELECT COUNT(*) FROM ayah").fetchone()[0]
        juz_distinct = cur.execute(
            "SELECT COUNT(DISTINCT juz) FROM ayah"
        ).fetchone()[0]
        print(f"  surahs: {n_surahs}")
        print(f"  ayat:   {n_ayat}")
        print(f"  juz' distinct values: {juz_distinct}")
        if n_surahs != 114 or n_ayat != 6236 or juz_distinct != 30:
            print(
                "WARN: expected 114 surahs / 6236 ayat / 30 juz' — "
                "verify source JSON",
                file=sys.stderr,
            )
            return 2
    finally:
        con.close()

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
