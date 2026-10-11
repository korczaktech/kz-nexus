from collections import defaultdict, deque
from time import monotonic
from threading import Lock

from .errors import AppError

_WINDOW_SECONDS = 60.0
_MAX_ATTEMPTS = 10
_MAX_BUCKETS = 10_000
_BUCKETS: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_LOCK = Lock()


def enforce_rate_limit(client_key: str, action: str) -> None:
    now = monotonic()
    key = (client_key, action)
    with _LOCK:
        # Prevent unbounded memory growth from one-off client keys. Only run
        # the global sweep near the cap to keep the common path inexpensive.
        if len(_BUCKETS) >= _MAX_BUCKETS:
            expired_before = now - _WINDOW_SECONDS
            for existing_key, existing_bucket in list(_BUCKETS.items()):
                while existing_bucket and existing_bucket[0] <= expired_before:
                    existing_bucket.popleft()
                if not existing_bucket:
                    _BUCKETS.pop(existing_key, None)
            while len(_BUCKETS) >= _MAX_BUCKETS:
                _BUCKETS.pop(next(iter(_BUCKETS)))
        bucket = _BUCKETS[key]
        while bucket and now - bucket[0] >= _WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= _MAX_ATTEMPTS:
            raise AppError("Muitas tentativas. Tente novamente mais tarde.", "rate_limited", 429)
        bucket.append(now)


def reset_rate_limits() -> None:
    with _LOCK:
        _BUCKETS.clear()
