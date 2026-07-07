"""Lean agent pipeline: build_profile -> select_candidates -> match -> synthesize.

Plain functions orchestrated by the Agent class. No LangGraph. Matching is LLM-over-catalog
(the whole candidate set is handed to Claude), so there are no embeddings or vector search.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator

from app.agent.geocode import GEOCODE_TOOL, geocode
from app.agent.llm import LLM, load_prompt
from app.agent.map_ops import MAP_OP_TOOL
from app.agent.search_tools import SEARCH_CITY_TOOL, SEARCH_SOLUTIONS_TOOL, SearchToolkit
from app.db.repositories.cities import CitiesRepository
from app.db.repositories.profiles import ProfilesRepository
from app.db.repositories.rag import RagRepository, city_key
from app.db.repositories.solutions import SolutionsRepository
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed_texts, embeddings_available
from app.domain.categories import CATEGORIES
from app.domain.models import ChatMessage, CityProfile, Match, Solution

_PROFILE_SCHEMA = {
    "type": "object",
    "properties": {
        "region": {"type": "string"},
        "population_tier": {
            "type": "string",
            "enum": ["small", "mid-size", "large", "metropolis"],
        },
        "climate": {"type": "string"},
        "density": {"type": "string"},
        "economy": {"type": "string"},
        "problem_domains": {
            "type": "array",
            "items": {"type": "string", "enum": CATEGORIES},
        },
        "notable_challenges": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"},
    },
    "required": ["problem_domains", "summary"],
    "additionalProperties": False,
}

_MATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "matches": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "solution_id": {"type": "string"},
                    "score": {"type": "number"},
                    "rationale": {"type": "string"},
                    "adaptation_notes": {"type": "string"},
                },
                "required": ["solution_id", "score", "rationale"],
            },
        }
    },
    "required": ["matches"],
}


def _compact(solution: dict) -> dict:
    """Trim a solution row to the fields the matcher needs (keeps the prompt small)."""
    city = solution.get("city") or {}
    return {
        "id": solution["id"],
        "city": city.get("name"),
        "country": city.get("country"),
        "category": solution["category"],
        "title": solution["title"],
        "problem": solution["problem"],
        "outcome": solution.get("outcome"),
    }


# The recommendation step is a tool now, so it runs ONLY when the user actually
# wants solutions — not on every message.
RECOMMEND_TOOL: dict = {
    "name": "recommend_solutions",
    "description": (
        "Find and show the user solutions from OTHER cities that fit their city, ranked "
        "by relevance. Call this ONLY when the user asks for solutions, recommendations, "
        "ideas, examples, or a comparison of what other cities did — NEVER for plain "
        "questions about their own city's state. The matched solutions appear to the user "
        "as cards and glowing map markers automatically; the tool result gives you the same "
        "shortlist so you can discuss them."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "focus": {"type": "string", "description": "optional problem area to emphasize"},
        },
        "required": [],
    },
}


class Agent:
    def __init__(
        self,
        llm: LLM,
        cities: CitiesRepository,
        solutions: SolutionsRepository,
        profiles: ProfilesRepository | None = None,
        rag: RagRepository | None = None,
    ):
        self.llm = llm
        self.cities = cities
        self.solutions = solutions
        self.profiles = profiles
        self.rag = rag

    # --- 1. Profile -----------------------------------------------------------------

    def build_profile(self, city: str, country: str) -> CityProfile:
        if self.profiles:
            cached = self.profiles.get(city, country)
            if cached:
                return CityProfile(**cached)

        data = self.llm.structured(
            system=load_prompt("profile.md"),
            prompt=f"City: {city}\nCountry: {country}",
            schema=_PROFILE_SCHEMA,
        )
        # The schema forbids extra keys, but a model may still echo city/country —
        # they would collide with the explicit kwargs below.
        data.pop("city", None)
        data.pop("country", None)
        profile = CityProfile(city=city, country=country, **data)

        if self.profiles:
            self.profiles.set(city, country, profile.model_dump(mode="json"))
        self._ingest_profile_doc(profile)
        return profile

    def _ingest_profile_doc(self, profile: CityProfile) -> None:
        """Make the generated profile searchable/citable via search_city_state."""
        if not (self.rag and embeddings_available()):
            return
        try:
            key = city_key(profile.city, profile.country)
            parts = [
                profile.summary or "",
                "Notable challenges: " + "; ".join(profile.notable_challenges),
                f"Population tier: {profile.population_tier}. Climate: {profile.climate}. "
                f"Density: {profile.density}. Economy: {profile.economy}.",
                "Problem domains: " + ", ".join(d.value for d in profile.problem_domains),
            ]
            chunks = chunk_text("\n\n".join(p for p in parts if p.strip()))
            if not chunks:
                return
            self.rag.delete_profile_doc(key)
            doc = self.rag.insert_city_doc({
                "city_key": key,
                "title": f"Профіль міста {profile.city} (AI)",
                "kind": "profile",
                "content": "\n\n".join(chunks),
            })
            embeddings = embed_texts(chunks)
            self.rag.insert_city_doc_chunks([
                {
                    "doc_id": doc["id"],
                    "city_key": key,
                    "content": chunk,
                    "embedding": embedding,
                }
                for chunk, embedding in zip(chunks, embeddings)
            ])
        except Exception as exc:  # profile generation must never fail on RAG hiccups
            print(f"profile doc ingest failed: {exc}")

    # --- 2. Candidate selection -----------------------------------------------------

    def select_candidates(self, profile: CityProfile) -> list[dict]:
        domains = [d.value for d in profile.problem_domains]
        candidates = self.solutions.by_categories(domains)
        # Drop solutions from the user's own city so we only recommend others' experience.
        return [
            c
            for c in candidates
            if not (c.get("city") or {}).get("name", "").lower() == profile.city.lower()
        ]

    # --- 3. Match -------------------------------------------------------------------

    def match(self, profile: CityProfile, candidates: list[dict], limit: int) -> list[Match]:
        if not candidates:
            return []

        catalog = [_compact(c) for c in candidates]
        prompt = (
            f"User city profile:\n{profile.model_dump_json(indent=2)}\n\n"
            f"Solution catalog ({len(catalog)} items):\n{json.dumps(catalog, ensure_ascii=False)}\n\n"
            f"Return up to {limit} of the most relevant matches."
        )
        data = self.llm.structured(
            system=load_prompt("match.md"),
            prompt=prompt,
            schema=_MATCH_SCHEMA,
            max_tokens=4096,
        )

        by_id = {c["id"]: c for c in candidates}
        matches: list[Match] = []
        for m in data.get("matches", [])[:limit]:
            row = by_id.get(m["solution_id"])
            if not row:  # ignore hallucinated ids
                continue
            matches.append(
                Match(
                    solution_id=m["solution_id"],
                    score=max(0.0, min(1.0, float(m.get("score", 0)))),
                    rationale=m["rationale"],
                    adaptation_notes=m.get("adaptation_notes"),
                    solution=Solution(**row),
                )
            )
        return matches

    def recommend(
        self, city: str, country: str, limit: int
    ) -> tuple[CityProfile, list[Match]]:
        profile = self.build_profile(city, country)
        candidates = self.select_candidates(profile)
        matches = self.match(profile, candidates, limit)
        return profile, matches

    # --- 4. Synthesize (streaming) --------------------------------------------------

    def _match_shortlist(self, matches: list[Match]) -> list[dict]:
        return [
            {
                "solution_id": m.solution_id,
                "city": m.solution.city.name if m.solution and m.solution.city else None,
                "title": m.solution.title if m.solution else None,
                "category": m.solution.category if m.solution else None,
                "outcome": m.solution.outcome if m.solution else None,
                "source_urls": m.solution.source_urls if m.solution else [],
                "why_it_fits": m.rationale,
                "adaptation_notes": m.adaptation_notes,
            }
            for m in matches
        ]

    def answer_stream(
        self,
        message: str,
        profile: CityProfile | None,
        history: list[ChatMessage],
        limit: int = 6,
        on_map_op: Callable[[dict], None] | None = None,
        on_matches: Callable[[list[Match]], None] | None = None,
        sources_out: dict[str, dict] | None = None,
    ) -> Iterator[dict]:
        """Yields typed stream events (see LLM.stream_with_tools). Solutions are
        NOT computed up front — the model calls `recommend_solutions` when the
        user actually wants them."""
        context_parts: list[str] = []
        if profile:
            context_parts.append(f"City profile:\n{profile.model_dump_json(indent=2)}")

        # If a deep dossier has been built, hand the model its verified hard facts
        # (population, mayor, area…) directly, plus the list of topics it can pull
        # detail on via search_city_state — so it answers from real data instead of
        # declining ("that's not in my profile").
        if profile and self.profiles:
            dossier = self.profiles.get_dossier(profile.city, profile.country)
            if dossier:
                facts = dossier.get("facts") or []
                if facts:
                    context_parts.append(
                        "Verified facts about the user's city (Wikidata / OpenStreetMap — treat as "
                        "authoritative):\n"
                        + "\n".join(f"- {f['label']}: {f['value']}" for f in facts)
                    )
                titles = [s["title"] for s in (dossier.get("sections") or []) if s.get("title")]
                if titles:
                    context_parts.append(
                        "A deep dossier on this city is on file. For specifics beyond the facts "
                        "above, call search_city_state. Topics covered: " + "; ".join(titles)
                    )

        messages: list[dict] = [
            {"role": m.role, "content": m.content} for m in history if m.role in ("user", "assistant")
        ]
        user_content = "\n\n".join(context_parts) + f"\n\nUser message:\n{message}"
        messages.append({"role": "user", "content": user_content})

        # The city catalog (ids the model may reference on the map).
        catalog = [
            {"id": c["id"], "name": c["name"], "country": c["country"]}
            for c in self.cities.list_with_counts()
        ]
        messages[-1]["content"] += (
            "\n\nCity catalog for the direct_map tool (id — name, country):\n"
            + json.dumps(catalog, ensure_ascii=False)
        )

        tools = [MAP_OP_TOOL, RECOMMEND_TOOL, GEOCODE_TOOL]
        toolkit: SearchToolkit | None = None
        if self.rag and embeddings_available():
            key = city_key(profile.city, profile.country) if profile else None
            toolkit = SearchToolkit(self.rag, key)
            tools += [SEARCH_SOLUTIONS_TOOL, SEARCH_CITY_TOOL]

        def do_recommend() -> str:
            if not profile:
                return json.dumps({"error": "the user has not set their city"})
            candidates = self.select_candidates(profile)
            matches = self.match(profile, candidates, limit)
            if on_matches:
                on_matches(matches)
            if not matches:
                return json.dumps({"matches": [], "note": "no matching solutions found"})
            return json.dumps(
                {"matches": self._match_shortlist(matches)}, ensure_ascii=False, default=str
            )

        def on_tool(name: str, raw: dict) -> str | None:
            if name == "direct_map":
                if on_map_op:
                    on_map_op(raw)
                return None  # -> "ok"
            if name == "recommend_solutions":
                return do_recommend()
            if name == "geocode_place":
                within = raw.get("within_user_city", True)
                return geocode(
                    str(raw.get("query", "")),
                    city=profile.city if profile and within else None,
                    country=profile.country if profile and within else None,
                )
            if toolkit:
                return toolkit.run(name, raw)
            return json.dumps({"error": f"unknown tool {name}"})

        yield from self.llm.stream_with_tools(
            system=load_prompt("synthesize.md"),
            messages=messages,
            tools=tools,
            on_tool=on_tool,
        )
        if toolkit and sources_out is not None:
            sources_out.update(toolkit.sources)
