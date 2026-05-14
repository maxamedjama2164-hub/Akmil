"""Wraps the Tarteel Whisper fine-tune for short Quranic recitation clips.

Model is loaded once at FastAPI startup; transcribe() is called from a
single-worker ThreadPoolExecutor so the asyncio loop stays responsive.
"""

from __future__ import annotations

import os

import numpy as np
import torch
from transformers import (
    GenerationConfig,
    WhisperForConditionalGeneration,
    WhisperProcessor,
)

from app.config import settings

# Several Tarteel and community Whisper fine-tunes ship an old-style
# generation_config missing the `lang_to_id` table that newer transformers
# requires. We borrow the canonical config from the matching OpenAI Whisper
# variant (same tokenizer/vocab family) — only the generation defaults
# change; the fine-tuned weights are untouched.
_OPENAI_VARIANTS: tuple[str, ...] = (
    "large-v3-turbo",
    "large-v3",
    "large-v2",
    "large",
    "medium",
    "small",
    "base",
    "tiny",
)


def _generation_config_source(model_id: str) -> str:
    mid = model_id.lower()
    for variant in _OPENAI_VARIANTS:
        if variant in mid:
            return f"openai/whisper-{variant}"
    return "openai/whisper-base"


class WhisperService:
    def __init__(self) -> None:
        torch.set_num_threads(os.cpu_count() or 1)

        self.processor = WhisperProcessor.from_pretrained(settings.whisper_model_id)
        self.model = WhisperForConditionalGeneration.from_pretrained(
            settings.whisper_model_id
        )
        self.model.eval()

        self.model.generation_config = GenerationConfig.from_pretrained(
            _generation_config_source(settings.whisper_model_id)
        )
        self.model.generation_config.language = "ar"
        self.model.generation_config.task = "transcribe"

    @torch.inference_mode()
    def transcribe(self, audio: np.ndarray) -> str:
        """Run greedy decoding on a 16 kHz mono float32 numpy array."""
        inputs = self.processor(audio, sampling_rate=16000, return_tensors="pt")
        generated = self.model.generate(
            inputs.input_features,
            max_new_tokens=200,
            num_beams=1,
            no_repeat_ngram_size=3,
        )
        text = self.processor.batch_decode(generated, skip_special_tokens=True)[0]
        return text.strip()
