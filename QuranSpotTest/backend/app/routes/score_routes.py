"""Solo-mode scoring endpoint.

POST /api/score with multipart fields:
  - file: the recorded audio blob
  - surah: int (1..114), the surah of the picked starting ayah
  - start_ayah: int (1..ayat_count), the picked ayah (the reciter must
    continue FROM this ayah, i.e. the target starts at start_ayah + 1)

Returns the score, transcript, and the target text used so the UI can
show side-by-side comparison.
"""

from __future__ import annotations

import asyncio
import time
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from app.auth import get_current_user
from app.models import User
from app.services.audio_pipeline import AudioDecodeError, decode_to_pcm
from app.services.normalizer import normalize
from app.services.quran_api_client import search_boost, search_verse
from app.services.rate_limiter import SlidingWindowRateLimiter
from app.services.scorer import score_round

router = APIRouter(prefix="/api", tags=["score"])

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB — headroom for 10-min recordings
MIN_AUDIO_SAMPLES = int(16000 * 0.3)  # 300 ms

# 5 scoring requests per 90 seconds per user — prevents CPU pinning on the
# single-threaded Whisper executor without blocking normal solo play.
_score_limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=90)


@router.post("/score")
async def solo_score(
    request: Request,
    current: Annotated[User, Depends(get_current_user)],
    surah: int = Form(...),
    start_ayah: int = Form(...),
    file: UploadFile = File(...),
) -> dict:
    if not _score_limiter.is_allowed(str(current.id)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="too many scoring requests — wait a moment before trying again",
        )
    if not (1 <= surah <= 114):
        raise HTTPException(status_code=400, detail="surah out of range")

    quran = request.app.state.quran
    surah_obj = next((s for s in quran.list_surahs() if s.id == surah), None)
    if surah_obj is None or not (1 <= start_ayah <= surah_obj.ayat_count):
        raise HTTPException(status_code=400, detail="start_ayah out of range")

    target = quran.build_target(surah, start_ayah)
    if not target.ayat:
        raise HTTPException(
            status_code=400,
            detail="cannot build target — picked ayah is at end of Quran",
        )

    raw = await file.read()
    if len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="audio too large",
        )

    try:
        audio = decode_to_pcm(raw)
    except AudioDecodeError as e:
        raise HTTPException(status_code=400, detail=f"audio decode failed: {e}")

    if audio.size < MIN_AUDIO_SAMPLES:
        raise HTTPException(status_code=400, detail="audio shorter than 300ms")

    t0 = time.perf_counter()
    loop = asyncio.get_running_loop()
    transcript = await loop.run_in_executor(
        request.app.state.tx_executor,
        request.app.state.whisper.transcribe,
        audio,
    )
    inference_s = time.perf_counter() - t0

    target_words = normalize(target.text_simple)
    asr_words = normalize(transcript)
    score = score_round(target_words, asr_words)

    # Search-based validation — catches ASR spelling variants that Levenshtein misses.
    # Only runs when base score is uncertain to save latency on clean recitations.
    search_validated = False
    if not score.passed or score.accuracy < 0.92:
        target_verse_key = f"{target.ayat[0].surah}:{target.ayat[0].number}"
        sr = await search_verse(transcript, target_verse_key)
        boosted_acc, boosted_passed = search_boost(score.accuracy, score.passed, sr)
        if boosted_passed and not score.passed:
            search_validated = True
            score = type(score)(
                accuracy=boosted_acc,
                word_accuracy=score.word_accuracy,
                char_accuracy=score.char_accuracy,
                passed=True,
                reason=None,
            )

    return {
        **score.to_dict(),
        "transcript": transcript,
        "transcript_normalized": " ".join(asr_words),
        "target_text_uthmani": target.text_uthmani,
        "target_text_normalized": " ".join(target_words),
        "ayat_used": target.ayat_list,
        "duration_s": round(audio.size / 16000, 3),
        "inference_s": round(inference_s, 3),
        "search_validated": search_validated,
    }
