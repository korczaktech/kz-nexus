"""Lightweight, privacy-conscious process telemetry for the public Kortex status page.

Metrics are in-memory and scoped to this API process/instance. No request bodies,
query strings, IP addresses, authorization headers, or document contents are retained.
"""
from __future__ import annotations

import re
import resource
import threading
import time
from collections import Counter, deque
from datetime import datetime, timezone
from typing import Any

_STARTED_AT = time.time()
_LOCK = threading.Lock()
_REQUESTS: deque[dict[str, Any]] = deque(maxlen=5000)
_EVENTS: deque[dict[str, Any]] = deque(maxlen=100)
_COUNTS: Counter[str] = Counter()
_ACTIVE = 0
_LAST_CPU = (time.process_time(), time.monotonic())
_CPU_PERCENT = 0.0
_NUMERIC_SEGMENT = re.compile(r"^\d+$")
_UUID_SEGMENT = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}$")
_EMAIL_SEGMENT = re.compile(r"^[^/\s@]+@[^/\s@]+\.[^/\s@]+$")


def _safe_path(path: str) -> str:
    parts = []
    for segment in path.split("/"):
        if _NUMERIC_SEGMENT.fullmatch(segment):
            parts.append(":id")
        elif _UUID_SEGMENT.fullmatch(segment) or _EMAIL_SEGMENT.fullmatch(segment) or len(segment) > 48:
            parts.append(":id")
        else:
            parts.append(segment[:80])
    return "/".join(parts)[:180] or "/"


def request_started() -> None:
    global _ACTIVE
    with _LOCK:
        _ACTIVE += 1


def request_finished(method: str, path: str, status_code: int, duration_ms: float) -> None:
    global _ACTIVE
    now = time.time()
    entry = {
        "timestamp": datetime.fromtimestamp(now, timezone.utc).isoformat(timespec="seconds"),
        "epoch": now,
        "method": method[:12],
        "path": _safe_path(path),
        "status": int(status_code),
        "duration_ms": round(max(0.0, duration_ms), 2),
    }
    with _LOCK:
        _ACTIVE = max(0, _ACTIVE - 1)
        _REQUESTS.append(entry)
        _COUNTS["requests_total"] += 1
        _COUNTS[f"status_{status_code // 100}xx"] += 1
        if status_code >= 400:
            _EVENTS.appendleft({
                "timestamp": entry["timestamp"],
                "severity": "error" if status_code >= 500 else "warning",
                "status": int(status_code),
                "method": entry["method"],
                "path": entry["path"],
                "duration_ms": entry["duration_ms"],
            })


def _memory_stats() -> dict[str, int | None]:
    rss_mb: int | None = None
    system_total_mb: int | None = None
    system_available_mb: int | None = None
    try:
        with open("/proc/self/status", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("VmRSS:"):
                    rss_mb = int(line.split()[1]) // 1024
                    break
    except (OSError, ValueError, IndexError):
        try:
            rss_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024
        except (OSError, ValueError):
            pass
    try:
        memory: dict[str, int] = {}
        with open("/proc/meminfo", encoding="utf-8") as handle:
            for line in handle:
                key, value = line.split(":", 1)
                if key in {"MemTotal", "MemAvailable"}:
                    memory[key] = int(value.strip().split()[0])
        system_total_mb = memory.get("MemTotal", 0) // 1024 or None
        system_available_mb = memory.get("MemAvailable", 0) // 1024 or None
    except (OSError, ValueError, IndexError):
        pass
    return {
        "process_rss_mb": rss_mb,
        "system_total_mb": system_total_mb,
        "system_available_mb": system_available_mb,
    }


def _cpu_percent() -> float | None:
    global _LAST_CPU, _CPU_PERCENT
    try:
        current_cpu = time.process_time()
        current_wall = time.monotonic()
        with _LOCK:
            old_cpu, old_wall = _LAST_CPU
            elapsed = current_wall - old_wall
            if elapsed >= 1:
                _CPU_PERCENT = round(max(0.0, (current_cpu - old_cpu) / elapsed * 100), 1)
                _LAST_CPU = (current_cpu, current_wall)
            return min(1000.0, _CPU_PERCENT)
    except (OSError, ValueError):
        return None


def snapshot() -> dict[str, Any]:
    now = time.time()
    with _LOCK:
        recent = [item for item in _REQUESTS if now - item["epoch"] <= 300]
        all_recent = list(_REQUESTS)
        events = list(_EVENTS)
        counts = dict(_COUNTS)
        active = _ACTIVE
    durations = sorted(item["duration_ms"] for item in recent)
    p95_index = max(0, int(len(durations) * 0.95) - 1) if durations else 0
    by_route: dict[str, dict[str, int]] = {}
    for item in recent:
        route = item["path"]
        row = by_route.setdefault(route, {"requests": 0, "errors": 0})
        row["requests"] += 1
        if item["status"] >= 400:
            row["errors"] += 1
    routes = [
        {"path": path, **values}
        for path, values in sorted(by_route.items(), key=lambda pair: pair[1]["requests"], reverse=True)[:8]
    ]
    buckets = []
    for index in range(10, 0, -1):
        start = now - index * 30
        end = start + 30
        buckets.append({
            "label": datetime.fromtimestamp(end, timezone.utc).strftime("%H:%M"),
            "requests": sum(1 for item in recent if start <= item["epoch"] < end),
        })
    total_recent = len(recent)
    errors_recent = sum(1 for item in recent if item["status"] >= 400)
    return {
        "service": "Korczak Nexus API",
        "instance_uptime_seconds": int(max(0, time.time() - _STARTED_AT)),
        "started_at": datetime.fromtimestamp(_STARTED_AT, timezone.utc).isoformat(timespec="seconds"),
        "captured_at": datetime.fromtimestamp(now, timezone.utc).isoformat(timespec="seconds"),
        "requests_total_since_start": counts.get("requests_total", 0),
        "requests_last_5m": total_recent,
        "requests_per_minute": round(total_recent / 5, 2),
        "errors_last_5m": errors_recent,
        "error_rate_last_5m_percent": round(errors_recent / total_recent * 100, 2) if total_recent else 0,
        "latency_avg_ms_last_5m": round(sum(durations) / len(durations), 2) if durations else None,
        "latency_p95_ms_last_5m": durations[p95_index] if durations else None,
        "active_requests": active,
        "status_groups_since_start": {
            "2xx": counts.get("status_2xx", 0),
            "3xx": counts.get("status_3xx", 0),
            "4xx": counts.get("status_4xx", 0),
            "5xx": counts.get("status_5xx", 0),
        },
        "cpu_process_percent_sampled": _cpu_percent(),
        **_memory_stats(),
        "traffic_buckets_30s": buckets,
        "top_routes_last_5m": routes,
        "recent_errors": events,
        "scope_note": "Métricas em memória desta instância; reinicializações zeram os contadores. Sem dados de corpos, documentos, IPs ou query strings.",
    }
