"""Simple in-memory sliding-window rate limiter.

Thread-safe; keyed by any string (user ID, IP address, etc.).
Does not persist across restarts — suitable for short-window abuse prevention.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self._max = max_requests
        self._window = window_seconds
        self._history: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def is_allowed(self, key: str) -> bool:
        """Return True if this key is within its quota, False if rate-limited."""
        now = time.monotonic()
        with self._lock:
            dq = self._history[key]
            cutoff = now - self._window
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= self._max:
                return False
            dq.append(now)
            return True
