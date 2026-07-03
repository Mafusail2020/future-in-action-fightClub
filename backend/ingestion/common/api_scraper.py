"""Template-method base for site scrapers.

No two sites look alike, so the base owns only the invariant pipeline
(disk cache + TTL, error isolation) and every site gets its own file with
its own subclass implementing exactly two hooks:

    fetch_site() -> Any        site-specific HTTP: endpoints, params, pagination
    parse(raw) -> SourceOutput site-specific extraction; pure, fixture-testable

fetch_site must return something JSON-serializable — that is what gets cached.
"""

from abc import abstractmethod
from typing import Any

from ingestion.common import http
from ingestion.common.base_source import Source, SourceOutput


class ApiScraperSource(Source):
    kind = "api"
    cache_key: str            # data/raw/api/{cache_key}.json
    ttl_hours: float | None   # None = cache forever (refresh with force=True)

    def __init__(self, force: bool = False):
        self.force = force

    def fetch(self) -> SourceOutput:
        """Invariant pipeline: cached raw -> parse. Subclasses do not override."""
        try:
            raw = http.cached(self.cache_key, self.ttl_hours, self.fetch_site,
                              force=self.force)
        except Exception as exc:  # one dead site must not kill --source all
            print(f"  ! {self.name}: fetch failed, skipping ({exc})")
            return SourceOutput()
        return self.parse(raw)

    @abstractmethod
    def fetch_site(self) -> Any: ...

    @abstractmethod
    def parse(self, raw: Any) -> SourceOutput: ...
