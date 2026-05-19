"""Quran Foundation public API client (api.quran.com/api/v4).

Fetches per-verse enrichment: English translation, Mushaf page, juz, hizb,
and sajdah info. No authentication required for these endpoints.
"""

from __future__ import annotations

import logging
import re

import httpx

log = logging.getLogger("quranspot")

_BASE = "https://api.quran.com/api/v4"
_TIMEOUT = 8.0
_HTML_TAG = re.compile(r"<[^>]+>")


async def get_verse_info(surah: int, ayah: int) -> dict:
    """Return enrichment dict for a single verse from the Quran Foundation API."""
    verse_key = f"{surah}:{ayah}"
    url = f"{_BASE}/verses/by_key/{verse_key}"
    params = {
        "translations": "131",   # Saheeh International (English)
        "fields": "text_uthmani,juz_number,hizb_number,rub_el_hizb_number,page_number,sajdah_type",
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        verse = data.get("verse", {})
        raw_translation = ""
        for t in verse.get("translations", []):
            raw_translation = t.get("text", "")
            break

        return {
            "verse_key": verse_key,
            "page_number": verse.get("page_number"),
            "juz_number": verse.get("juz_number"),
            "hizb_number": verse.get("hizb_number"),
            "sajdah_type": verse.get("sajdah_type"),
            "translation_en": _HTML_TAG.sub("", raw_translation).strip(),
        }
    except Exception as exc:
        log.warning("Quran Foundation API error for %s: %s", verse_key, exc)
        return {"verse_key": verse_key, "error": str(exc)}
