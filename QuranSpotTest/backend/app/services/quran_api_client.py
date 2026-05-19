"""Quran.Foundation API client — OAuth2 client-credentials + search.

Responsibilities:
  - Exchange client_id/secret for a bearer token (client-credentials flow)
  - Cache the token in memory and refresh before expiry
  - Expose search_verse() for scoring validation

Why search helps scoring:
  Whisper transcribes Arabic phonetically with spelling variations.  The
  Quran.com search index is trained on canonical Quranic text, so it can
  fuzzy-match a garbled transcript to the correct verse.  If the target
  verse appears in the top search results it means the user said the right
  content even if Whisper mangled the spelling.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import httpx

from app.config import settings
from app.services.normalizer import normalize

log = logging.getLogger("quranspot")

_CONTENT_BASE = "https://api.quran.com/api/v4"
_TOKEN_BUFFER_S = 60          # refresh 60 s before actual expiry
_SEARCH_TIMEOUT  = 3.5        # seconds — abort rather than stall a scoring request
_TOKEN_TIMEOUT   = 5.0


# ── Token cache (module-level singleton, reset on process restart) ─────────────

@dataclass
class _Token:
    value: str = ""
    expires_at: float = 0.0

    def valid(self) -> bool:
        return bool(self.value) and time.monotonic() < self.expires_at


_token = _Token()


async def _bearer() -> str | None:
    """Return a valid bearer token, exchanging credentials if needed."""
    if not (settings.quran_client_id and settings.quran_client_secret):
        return None

    if _token.valid():
        return _token.value

    try:
        async with httpx.AsyncClient(timeout=_TOKEN_TIMEOUT) as client:
            resp = await client.post(
                f"{settings.quran_oauth_endpoint}/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id":     settings.quran_client_id,
                    "client_secret": settings.quran_client_secret,
                    "scope": "content",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            body = resp.json()

        _token.value      = body["access_token"]
        expires_in        = int(body.get("expires_in", 3600))
        _token.expires_at = time.monotonic() + expires_in - _TOKEN_BUFFER_S
        log.info("Quran.Foundation token acquired (expires in %ds)", expires_in)
        return _token.value

    except Exception as exc:
        log.warning("Quran.Foundation token exchange failed: %s", exc)
        return None


# ── Search ────────────────────────────────────────────────────────────────────

@dataclass
class SearchResult:
    found: bool
    rank: int | None        # 1-indexed rank of target in results; None if absent
    top_verse_key: str | None   # verse_key of the #1 result


async def search_verse(
    transcript: str,
    target_verse_key: str,
    *,
    size: int = 10,
) -> SearchResult:
    """Search Quran.com for the transcript; check whether the target verse is a top hit.

    Returns a SearchResult with found=False and rank=None on any API error so
    callers can fall back to base Levenshtein scoring gracefully.
    """
    # Normalize the query: strip diacritics, keep first 12 words only.
    words = normalize(transcript)
    if not words:
        return SearchResult(found=False, rank=None, top_verse_key=None)
    query = " ".join(words[:12])

    headers: dict[str, str] = {}
    token = await _bearer()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=_SEARCH_TIMEOUT) as client:
            resp = await client.get(
                f"{_CONTENT_BASE}/search",
                params={"q": query, "size": size, "page": 1},
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        log.warning("Quran.com search failed for '%s…': %s", query[:30], exc)
        return SearchResult(found=False, rank=None, top_verse_key=None)

    results: list[dict] = data.get("search", {}).get("results", [])
    if not results:
        return SearchResult(found=False, rank=None, top_verse_key=None)

    top_key = results[0].get("verse_key")
    for rank, r in enumerate(results, 1):
        if r.get("verse_key") == target_verse_key:
            return SearchResult(found=True, rank=rank, top_verse_key=top_key)

    return SearchResult(found=False, rank=None, top_verse_key=top_key)


def search_boost(base_accuracy: float, base_passed: bool, result: SearchResult) -> tuple[float, bool]:
    """Return (accuracy, passed) after applying search override logic.

    Rules:
      - If already passing, leave unchanged.
      - If target found at rank 1   → boost accuracy to ≥ 0.90, mark passed.
      - If target found at rank 2–3 → boost accuracy to ≥ 0.85, mark passed.
      - If target found at rank 4+  → boost accuracy to ≥ 0.80, mark passed.
      - If target not found         → leave unchanged (keep base score).
    """
    if base_passed or not result.found or result.rank is None:
        return base_accuracy, base_passed

    floor = 0.90 if result.rank == 1 else (0.85 if result.rank <= 3 else 0.80)
    return max(base_accuracy, floor), True
