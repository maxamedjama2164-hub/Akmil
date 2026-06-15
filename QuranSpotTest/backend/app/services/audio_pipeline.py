"""Decode arbitrary audio containers (WebM/Opus, MP4/AAC, WAV, MP3) into the
16 kHz mono float32 numpy format that Whisper expects.

We shell out to ffmpeg via stdin/stdout pipes — no temp files needed.
"""

from __future__ import annotations

import os as _os
import pathlib as _pathlib

# 1. Try imageio-ffmpeg (bundled static binary — works on Railway/Linux with no
#    system ffmpeg installed).
try:
    from imageio_ffmpeg import get_ffmpeg_exe as _get_ffmpeg_exe
    _ffmpeg_dir = str(_pathlib.Path(_get_ffmpeg_exe()).parent)
    if _ffmpeg_dir not in _os.environ.get("PATH", ""):
        _os.environ["PATH"] = _ffmpeg_dir + _os.pathsep + _os.environ.get("PATH", "")
except Exception:
    pass

# 2. Also add ~/.local/bin as a fallback (covers manual installs on Linux).
_local_bin = str(_pathlib.Path.home() / ".local" / "bin")
if _local_bin not in _os.environ.get("PATH", ""):
    _os.environ["PATH"] = _local_bin + _os.pathsep + _os.environ.get("PATH", "")

import ffmpeg
import numpy as np


class AudioDecodeError(RuntimeError):
    pass


def decode_to_pcm(audio_bytes: bytes) -> np.ndarray:
    """Decode an audio blob to a 16 kHz mono float32 array in [-1.0, 1.0]."""
    if not audio_bytes:
        raise AudioDecodeError("empty audio")
    try:
        out, _err = (
            ffmpeg.input("pipe:0")
            .output("pipe:1", format="s16le", ac=1, ar=16000)
            .run(input=audio_bytes, capture_stdout=True, capture_stderr=True, quiet=True)
        )
    except ffmpeg.Error as e:  # type: ignore[attr-defined]
        msg = (e.stderr or b"").decode("utf-8", errors="ignore").strip()
        raise AudioDecodeError(msg or "ffmpeg failed") from e

    if not out:
        raise AudioDecodeError("ffmpeg produced no audio (silent / corrupt input)")

    pcm = np.frombuffer(out, dtype=np.int16).astype(np.float32) / 32768.0
    return pcm
