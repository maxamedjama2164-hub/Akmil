#!/usr/bin/env python
"""One-time conversion of tarteel-ai/whisper-base-ar-quran → CTranslate2 format.

This produces data/tarteel-base-ct2/ which the backend loads automatically
in preference to the generic "base" Whisper model.

Requirements (install once, not part of main deps):
    pip install transformers torch

Then run:
    python backend/scripts/convert_tarteel_model.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "tarteel-base-ct2"
HF_MODEL = "tarteel-ai/whisper-base-ar-quran"


def main() -> None:
    if OUTPUT.exists() and any(OUTPUT.iterdir()):
        print(f"Model already converted at:\n  {OUTPUT}")
        print("Delete that directory to re-convert.")
        return

    # Check dependencies
    missing = []
    try:
        import ctranslate2  # noqa: F401
    except ImportError:
        missing.append("ctranslate2")
    try:
        import transformers  # noqa: F401
    except ImportError:
        missing.append("transformers")
    try:
        import torch  # noqa: F401
    except ImportError:
        missing.append("torch")

    if missing:
        print("Missing packages:", ", ".join(missing))
        print("\nInstall them with:")
        print("  pip install transformers torch")
        print("(or: uv pip install transformers torch)")
        sys.exit(1)

    import ctranslate2.converters

    OUTPUT.mkdir(parents=True, exist_ok=True)

    print(f"Downloading {HF_MODEL} from HuggingFace (~150 MB)…")
    print("Converting to CTranslate2 int8 format…")
    print("This takes a few minutes on first run.\n")

    converter = ctranslate2.converters.TransformersConverter(
        HF_MODEL,
        low_cpu_mem_usage=True,
    )
    output_path = converter.convert(str(OUTPUT), quantization="int8", force=True)

    print(f"\nDone. Model saved to:\n  {output_path}")
    print("\nRestart the backend — it will now use the Tarteel model automatically.")


if __name__ == "__main__":
    main()
