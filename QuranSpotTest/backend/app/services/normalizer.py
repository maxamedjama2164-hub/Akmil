"""Normalize Arabic text for ASR-vs-canonical comparison.

The goal is to fold the dimensions of Arabic spelling that ASR systems
disagree about — diacritics, hamza placement, ya/alif-maqsura, ta-marbuta —
so that token-level comparison is meaningful.
"""

from __future__ import annotations

import re

from pyarabic import araby

# Anything outside the Arabic block (U+0600 – U+06FF) is dropped — punctuation,
# Latin letters, digits, etc. This is intentional: the ASR sometimes emits
# punctuation or numerals that the canonical Quran text doesn't contain.
_ARABIC_RANGE = re.compile(r"[^؀-ۿ\s]")
_WHITESPACE = re.compile(r"\s+")


def normalize(text: str) -> list[str]:
    """Normalize an Arabic string into a list of comparable tokens.

    Transformations:
      1. Strip all tashkeel (fatha, kasra, damma, shadda, sukoon, ...).
      2. Strip tatweel (the kashida U+0640).
      3. Collapse hamza variants: أ إ آ ٱ → ا, ؤ → و, ئ → ي, ء → (drop).
      4. Collapse alif maqsura: ى → ي.
      5. Collapse ta marbuta: ة → ه.
      6. Drop everything outside the Arabic block.
      7. Collapse whitespace, split on whitespace.
    """
    if not text:
        return []
    s = araby.strip_tashkeel(text)
    s = araby.strip_tatweel(s)
    s = (
        s.replace("أ", "ا")  # أ → ا
        .replace("إ", "ا")  # إ → ا
        .replace("آ", "ا")  # آ → ا
        .replace("ٱ", "ا")  # ٱ → ا (alif wasla)
        .replace("ؤ", "و")  # ؤ → و (hamza on waw)
        .replace("ئ", "ي")  # ئ → ي (hamza on ya)
        .replace("ء", "")   # bare hamza — Whisper often omits entirely
        .replace("ى", "ي")  # ى → ي
        .replace("ة", "ه")  # ة → ه
    )
    s = _ARABIC_RANGE.sub(" ", s)
    s = _WHITESPACE.sub(" ", s).strip()
    return s.split() if s else []
