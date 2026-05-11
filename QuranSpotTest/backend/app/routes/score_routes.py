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

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status

from app.services.audio_pipeline import AudioDecodeError, decode_to_pcm
from app.services.normalizer import normalize
from app.services.scorer import score_round

router = APIRouter(prefix="/api", tags=["score"])

MAX_AUDIO_BYTES = 5 * 1024 * 1024  # 5 MB
MIN_AUDIO_SAMPLES = int(16000 * 0.3)  # 300 ms


@router.post("/score")
async def solo_score(
    request: Request,
    surah: int = Form(...),
    start_ayah: int = Form(...),
    file: UploadFile = File(...),
) -> dict:
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

    return {
        **score.to_dict(),
        "transcript": transcript,
        "transcript_normalized": " ".join(asr_words),
        "target_text_uthmani": target.text_uthmani,
        "target_text_normalized": " ".join(target_words),
        "ayat_used": target.ayat_list,
        "duration_s": round(audio.size / 16000, 3),
        "inference_s": round(inference_s, 3),
    }
