"""Pre-computes exact-duplicate (repeated) and fuzzy-similar ayah pairs.

Exact duplicates  → status "repeated"  (e.g. Al-Rahman's refrain)
Near-duplicates   → status "similar"   (≥ SIMILAR_THRESHOLD fuzz.ratio)

Results are cached to data/similarity.json so recomputation only happens once.
"""

from __future__ import annotations

import json
import logging
import random
import re
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Literal

from rapidfuzz import fuzz

log = logging.getLogger("quranspot")

SIMILAR_THRESHOLD = 82  # fuzz.ratio score (0-100)

_TASHKEEL = re.compile(
    r"[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]"
)


def _normalize(text: str) -> str:
    return _TASHKEEL.sub("", text).strip()


class SimilarityService:
    def __init__(self, db_path: Path, cache_path: Path | None = None) -> None:
        self._cache = cache_path or db_path.parent / "similarity.json"
        self._repeated: dict[tuple[int, int], list[list[int]]] = {}
        self._similar: dict[tuple[int, int], list[list[int]]] = {}

        if self._cache.exists():
            log.info("Loading similarity cache from %s", self._cache)
            self._load()
        else:
            log.info("Computing ayah similarity index (one-time, may take ~30s) …")
            self._compute(db_path)
            self._save()
            log.info(
                "Similarity index ready: %d repeated, %d similar",
                len(self._repeated),
                len(self._similar),
            )

    # ── Public ────────────────────────────────────────────────────────────────

    def status(self, surah: int, number: int) -> str | None:
        if (surah, number) in self._repeated:
            return "repeated"
        if (surah, number) in self._similar:
            return "similar"
        return None

    def surah_statuses(self, surah: int) -> dict[int, str]:
        """Return sparse {ayah_number: status} for a surah (only non-null entries)."""
        result: dict[int, str] = {}
        for (s, n) in self._repeated:
            if s == surah:
                result[n] = "repeated"
        for (s, n) in self._similar:
            if s == surah and n not in result:
                result[n] = "similar"
        return result

    def peers(self, surah: int, number: int) -> dict:
        return {
            "repeated": self._repeated.get((surah, number), []),
            "similar": self._similar.get((surah, number), []),
        }

    def random_similar_pair(
        self,
        similar_only: bool = False,
    ) -> tuple[tuple[int, int], tuple[int, int], Literal["repeated", "similar"]] | None:
        """Return a random ((s1,n1), (s2,n2), kind) pair, or None if index is empty.

        similar_only=True skips repeated (identical) pairs and only returns
        genuinely near-duplicate pairs — useful for challenges where showing
        identical text as both options would be nonsensical.
        """
        pools: list[tuple[dict, str]] = (
            [(self._similar, "similar")]
            if similar_only
            else [(self._repeated, "repeated"), (self._similar, "similar")]
        )
        for pool, kind in pools:
            if pool:
                (s1, n1), peers = random.choice(list(pool.items()))
                s2, n2 = random.choice(peers)
                return (s1, n1), (s2, n2), kind  # type: ignore[return-value]
        return None

    # ── Private ───────────────────────────────────────────────────────────────

    def _load(self) -> None:
        data = json.loads(self._cache.read_text(encoding="utf-8"))
        for k, v in data["repeated"].items():
            s, n = map(int, k.split(","))
            self._repeated[(s, n)] = v
        for k, v in data["similar"].items():
            s, n = map(int, k.split(","))
            self._similar[(s, n)] = v

    def _save(self) -> None:
        out = {
            "repeated": {f"{s},{n}": v for (s, n), v in self._repeated.items()},
            "similar": {f"{s},{n}": v for (s, n), v in self._similar.items()},
        }
        self._cache.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

    def _compute(self, db_path: Path) -> None:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT surah, number, text_simple FROM ayah ORDER BY surah, number"
        ).fetchall()
        conn.close()

        ayat = [(r["surah"], r["number"], _normalize(r["text_simple"])) for r in rows]

        # ── Step 1: exact duplicates ──────────────────────────────────────
        by_text: dict[str, list[list[int]]] = defaultdict(list)
        for s, n, text in ayat:
            by_text[text].append([s, n])

        for peers in by_text.values():
            if len(peers) > 1:
                for i, (s, n) in enumerate(peers):
                    self._repeated[(s, n)] = [p for j, p in enumerate(peers) if j != i]

        # ── Step 2: fuzzy near-duplicates ─────────────────────────────────
        # Build inverted word index; skip very common words to stay O(n log n).
        word_index: dict[str, list[int]] = defaultdict(list)
        for idx, (_, _, text) in enumerate(ayat):
            for word in set(text.split()):
                word_index[word].append(idx)

        # Count shared words per pair
        pair_shared: dict[tuple[int, int], int] = defaultdict(int)
        for idxs in word_index.values():
            if len(idxs) > 400:   # skip extremely common words
                continue
            for i in range(len(idxs)):
                for j in range(i + 1, len(idxs)):
                    pair_shared[(idxs[i], idxs[j])] += 1

        for (i, j), shared in pair_shared.items():
            if shared < 3:
                continue
            s1, n1, t1 = ayat[i]
            s2, n2, t2 = ayat[j]
            if (s1, n1) in self._repeated or (s2, n2) in self._repeated:
                continue
            len1, len2 = len(t1.split()), len(t2.split())
            if not len1 or not len2:
                continue
            if min(len1, len2) / max(len1, len2) < 0.55:
                continue
            score = fuzz.ratio(t1, t2)
            if score >= SIMILAR_THRESHOLD:
                self._similar.setdefault((s1, n1), []).append([s2, n2])
                self._similar.setdefault((s2, n2), []).append([s1, n1])
