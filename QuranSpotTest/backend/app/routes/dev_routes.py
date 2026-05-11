"""Dev-only smoke endpoints. Not for production use."""

from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status

from app.services.audio_pipeline import AudioDecodeError, decode_to_pcm

router = APIRouter(prefix="/api/dev", tags=["dev"])

MAX_AUDIO_BYTES = 5 * 1024 * 1024  # 5 MB — well over a 15s Opus blob
MIN_AUDIO_SAMPLES = int(16000 * 0.3)  # 300 ms


@router.post("/transcribe")
async def dev_transcribe(
    request: Request,
    file: UploadFile = File(...),
) -> dict:
    raw = await file.read()
    if len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="audio file too large",
        )

    try:
        audio = decode_to_pcm(raw)
    except AudioDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"audio decode failed: {e}",
        )

    if audio.size < MIN_AUDIO_SAMPLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="audio shorter than 300ms",
        )

    t0 = time.perf_counter()
    loop = asyncio.get_running_loop()
    transcript = await loop.run_in_executor(
        request.app.state.tx_executor,
        request.app.state.whisper.transcribe,
        audio,
    )
    dt = time.perf_counter() - t0

    return {
        "transcript": transcript,
        "duration_s": round(audio.size / 16000, 3),
        "inference_s": round(dt, 3),
        "input_bytes": len(raw),
        "content_type": file.content_type,
    }
