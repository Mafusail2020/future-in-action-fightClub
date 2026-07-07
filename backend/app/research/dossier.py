"""Deep-dossier orchestrator.

gather (open data + web research) -> LLM synthesis grounded in that material ->
assemble a structured Dossier -> ingest every section/fact into city_docs so the
chat can cite it -> cache. Emits progress events so the UI can show the build
happening live. Fully degrades: any layer that yields nothing is simply skipped.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import UTC, datetime

from app.agent.llm import LLM, load_prompt
from app.db.repositories.profiles import ProfilesRepository
from app.db.repositories.rag import RagRepository, city_key
from app.domain.dossier import Confidence, Dossier, DossierSection
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed_texts, embeddings_available
from app.research.opendata import gather_open_data
from app.research.websearch import WebResearch, research_web

Progress = Callable[[str, dict], None]

# Hard wall-clock cap on a whole build. Whatever has been gathered when the
# deadline hits is assembled and saved — the build never runs past this.
_BUDGET_S = 300


def _call_with_timeout(fn: Callable, seconds: float):
    """Run fn() but give up after `seconds`, leaving any still-blocking network
    call to finish (and be discarded) in its own thread rather than stalling."""
    ex = ThreadPoolExecutor(max_workers=1)
    try:
        return ex.submit(fn).result(timeout=max(1.0, seconds))
    finally:
        ex.shutdown(wait=False)

_SECTION_KEYS = [
    "identity", "history", "geography", "demographics", "governance", "economy", "energy",
    "transport", "housing", "water", "waste", "environment", "climate_risk", "digital",
    "health", "education", "safety", "culture", "war_impact", "programs",
]

_SYNTH_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "enum": _SECTION_KEYS},
                    "title": {"type": "string"},
                    "body": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "sourced": {"type": "boolean"},
                },
                "required": ["key", "title", "body"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["headline", "sections"],
    "additionalProperties": False,
}


class DossierBuilder:
    def __init__(self, llm: LLM, rag: RagRepository | None, profiles: ProfilesRepository | None):
        self.llm = llm
        self.rag = rag
        self.profiles = profiles

    def get_cached(self, city: str, country: str) -> Dossier | None:
        if not self.profiles:
            return None
        cached = self.profiles.get_dossier(city, country)
        return Dossier(**cached) if cached else None

    def build(
        self,
        city: str,
        country: str,
        on_progress: Progress | None = None,
        with_osm: bool = True,
    ) -> Dossier:
        def progress(stage: str, **data):
            if on_progress:
                on_progress(stage, data)

        started = time.monotonic()

        def remaining() -> float:
            return _BUDGET_S - (time.monotonic() - started)

        # 1. Hard open data (Wikidata / Wikipedia / OSM) — bounded by its own timeouts.
        progress("opendata:start")
        od = gather_open_data(city, country, with_osm=with_osm)
        progress("opendata:done", facts=len(od.facts))

        # 2. Live web research — only if enough of the budget is left to also
        # synthesize afterwards (research_web self-caps per request).
        web = WebResearch()
        if remaining() > 120:
            web = research_web(city, country, on_progress=on_progress)
        else:
            progress("web:done", found=0)

        # 3. LLM synthesis grounded in 1 + 2, capped by whatever budget is left so
        # a stalled call can't blow past the 5-minute wall clock.
        progress("synth:start")
        prompt = (
            f"City: {city}\nCountry: {country}\n\n"
            f"=== Open data ===\n{od.grounding or '(none)'}\n\n"
            f"=== Web research briefing ===\n{web.briefing or '(none)'}\n\n"
            "Write the full dossier grounded in the above."
        )
        sections: list[DossierSection] = []
        headline = None
        if remaining() > 15:
            try:
                data = _call_with_timeout(
                    lambda: self.llm.structured(
                        system=load_prompt("dossier.md"),
                        prompt=prompt,
                        schema=_SYNTH_SCHEMA,
                        max_tokens=8000,
                        thinking={"type": "disabled"},  # grounded synthesis; keep it fast
                    ),
                    seconds=min(remaining() - 10, 210),
                )
                headline = data.get("headline")
                for s in data.get("sections", []):
                    conf: Confidence = s.get("confidence", "medium")
                    sections.append(
                        DossierSection(
                            key=s["key"],
                            title=s["title"],
                            body=s["body"],
                            confidence=conf if conf in ("high", "medium", "low") else "medium",
                            sourced=bool(s.get("sourced", False)),
                        )
                    )
            except FutureTimeout:
                print("dossier synthesis timed out (budget)")
            except Exception as exc:
                print(f"dossier synthesis failed: {exc}")
        progress("synth:done", sections=len(sections))

        dossier = Dossier(
            city=city,
            country=country,
            headline=headline,
            facts=od.facts,
            sections=sections,
            sources=od.sources + web.sources,
            generated_at=datetime.now(UTC).isoformat(),
        )

        # 4. Ingest into the searchable corpus + cache. Save any build that found
        # something real (sections OR hard facts) — including a budget-truncated
        # partial — but never an empty "0 тем · 0 фактів" shell from a failed run.
        progress("ingest:start")
        if sections or od.facts:
            self._ingest(city, country, dossier, web.briefing, od)
            if self.profiles:
                try:
                    self.profiles.set_dossier(city, country, dossier.model_dump(mode="json"))
                except Exception as exc:
                    print(f"dossier cache failed: {exc}")
        progress("ingest:done")

        return dossier

    def _ingest(self, city: str, country: str, dossier: Dossier, briefing: str, od) -> None:
        """Chunk + embed every section/fact/web-finding into city_docs so
        search_city_state can ground and cite the assistant's answers."""
        if not (self.rag and embeddings_available()):
            return
        try:
            key = city_key(city, country)
            self.rag.delete_city_docs_by_kind(key, ["dossier", "web", "opendata"])

            pending: list[tuple[str, str]] = []  # (doc_id, chunk_text)

            def add_doc(title: str, content: str, kind: str, url: str | None):
                chunks = chunk_text(content)
                if not chunks:
                    return
                doc = self.rag.insert_city_doc({
                    "city_key": key,
                    "title": title,
                    "kind": kind,
                    "content": "\n\n".join(chunks),
                    "source_url": url,
                })
                for c in chunks:
                    pending.append((doc["id"], c))

            for s in dossier.sections:
                add_doc(f"{dossier.city}: {s.title}", s.body, "dossier", None)
            if od.facts:
                facts_prose = "; ".join(f"{f.label}: {f.value}" for f in od.facts)
                fact_url = next((f.url for f in od.facts if f.url), None)
                add_doc(f"{dossier.city}: відкриті дані", facts_prose, "opendata", fact_url)
            if briefing:
                web_url = next((s.url for s in dossier.sources if s.kind == "web"), None)
                add_doc(f"{dossier.city}: веб-дослідження", briefing, "web", web_url)

            if pending:
                embeddings = embed_texts([c for _, c in pending])
                self.rag.insert_city_doc_chunks([
                    {"doc_id": doc_id, "city_key": key, "content": c, "embedding": emb}
                    for (doc_id, c), emb in zip(pending, embeddings)
                ])
        except Exception as exc:  # ingestion must never fail the dossier
            print(f"dossier ingest failed: {exc}")
