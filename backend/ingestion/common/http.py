"""Cached HTTP for API scrapers.

Same idea as the Overpass cache (ingestion/common/overpass.py) but generalized:
the cache wraps an arbitrary fetch callable, because some sites need several
requests (pagination) to produce one raw payload.
"""

import json
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

CACHE_DIR = Path("data/raw/api")

# Some Ukrainian services (SaveEcoBot behind Cloudflare) reject default
# python/curl user agents; a browser UA is enough.
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}


def cached(cache_key: str, ttl_hours: float | None, fetch_fn: Callable[[], Any],
           force: bool = False) -> Any:
    """Return the cached payload for cache_key, or call fetch_fn and cache it.

    ttl_hours=None means the cache never expires (refresh only with force=True).
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{cache_key}.json"

    if cache_file.exists() and not force:
        envelope = json.loads(cache_file.read_text())
        fetched_at = datetime.fromisoformat(envelope["fetched_at"])
        age_hours = (datetime.now(UTC) - fetched_at).total_seconds() / 3600
        if ttl_hours is None or age_hours < ttl_hours:
            return envelope["payload"]

    payload = fetch_fn()
    cache_file.write_text(json.dumps(
        {"fetched_at": datetime.now(UTC).isoformat(), "payload": payload},
        ensure_ascii=False,
    ))
    return payload


def get_json(url: str, params: dict[str, Any] | None = None, method: str = "GET") -> Any:
    """One JSON request with browser headers and politeness delay."""
    response = httpx.request(method, url, params=params, headers=_HEADERS,
                             timeout=60, follow_redirects=True)
    response.raise_for_status()
    time.sleep(1)
    return response.json()


def get_bytes(url: str) -> bytes:
    """Download a binary resource (e.g. a ZIP of budget annexes)."""
    response = httpx.get(url, headers=_HEADERS, timeout=120, follow_redirects=True)
    response.raise_for_status()
    time.sleep(1)
    return response.content
