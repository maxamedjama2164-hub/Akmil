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

# Tarteel's checkpoint ships an old-style generation_config that's missing
# the `lang_to_id` table newer transformers requires. We borrow the canonical
# config from openai/whisper-base — same tokenizer/vocab family, but it has
# the language-id lookup. Only the generation defaults change; weights are
# Tarteel's untouched.
_GENERATION_CONFIG_SOURCE = "openai/whisper-base"


class WhisperService:
    def __init__(self) -> None:
        torch.set_num_threads(os.cpu_count() or 1)

        self.processor = WhisperProcessor.from_pretrained(settings.whisper_model_id)
        self.model = WhisperForConditionalGeneration.from_pretrained(
            settings.whisper_model_id
        )
        self.model.eval()

        self.model.generation_config = GenerationConfig.from_pretrained(
            _GENERATION_CONFIG_SOURCE
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
