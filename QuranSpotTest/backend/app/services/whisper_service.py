"""Wraps Whisper transcription via faster-whisper (CTranslate2) for fast CPU inference.

Loads from settings.whisper_ct2_path if it exists (converted Tarteel model),
otherwise falls back to settings.whisper_model_id (HuggingFace CT2 model ID).
Run backend/scripts/convert_tarteel_model.py once to build the local CT2 model.
"""

from __future__ import annotations

import logging
import threading

import numpy as np
from faster_whisper import WhisperModel

from app.config import settings

log = logging.getLogger("quranspot")


class WhisperService:
    def __init__(self) -> None:
        self._model: WhisperModel | None = None
        self._lock = threading.Lock()
        threading.Thread(target=self._ensure_loaded, daemon=True).start()

    def _ensure_loaded(self) -> WhisperModel:
        with self._lock:
            if self._model is None:
                if settings.whisper_ct2_path.exists():
                    model_src = str(settings.whisper_ct2_path)
                    log.info("Loading local Tarteel CT2 model from %s", model_src)
                else:
                    model_src = settings.whisper_model_id
                    log.info(
                        "Local CT2 model not found — loading %s from HuggingFace. "
                        "Run scripts/convert_tarteel_model.py for the fine-tuned model.",
                        model_src,
                    )
                self._model = WhisperModel(model_src, device="cpu", compute_type="int8")
        return self._model

    def transcribe(self, audio: np.ndarray) -> str:
        """Transcribe a 16 kHz mono float32 numpy array."""
        model = self._ensure_loaded()
        segments, _ = model.transcribe(
            audio,
            language="ar",
            beam_size=5,
            condition_on_previous_text=False,
            vad_filter=True,
            without_timestamps=True,
        )
        return "".join(s.text for s in segments).strip()
