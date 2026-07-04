"""Lean agent pipeline: build_profile -> select_candidates -> match -> synthesize.

Plain functions orchestrated by the Agent class. No LangGraph. Matching is LLM-over-catalog
(the whole candidate set is handed to Claude), so there are no embeddings or vector search.
"""

from __future__ import annotations

import json
from collections.abc import Iterator

from app.agent.llm import LLM, load_prompt
from app.db.repositories.cities import CitiesRepository
from app.db.repositories.profiles import ProfilesRepository
from app.db.repositories.solutions import SolutionsRepository
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


class Agent:
    def __init__(
        self,
        llm: LLM,
        cities: CitiesRepository,
        solutions: SolutionsRepository,
        profiles: ProfilesRepository | None = None,
    ):
        self.llm = llm
        self.cities = cities
        self.solutions = solutions
        self.profiles = profiles

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
        profile = CityProfile(city=city, country=country, **data)

        if self.profiles:
            self.profiles.set(city, country, profile.model_dump(mode="json"))
        return profile

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

    def answer_stream(
        self,
        message: str,
        profile: CityProfile | None,
        matches: list[Match],
        history: list[ChatMessage],
    ) -> Iterator[str]:
        context_parts: list[str] = []
        if profile:
            context_parts.append(f"City profile:\n{profile.model_dump_json(indent=2)}")
        if matches:
            shortlist = [
                {
                    "city": m.solution.city.name if m.solution and m.solution.city else None,
                    "title": m.solution.title if m.solution else None,
                    "category": m.solution.category if m.solution else None,
                    "solution": m.solution.solution if m.solution else None,
                    "outcome": m.solution.outcome if m.solution else None,
                    "source_urls": m.solution.source_urls if m.solution else [],
                    "why_it_fits": m.rationale,
                    "adaptation_notes": m.adaptation_notes,
                }
                for m in matches
            ]
            context_parts.append(
                "Matched solutions:\n" + json.dumps(shortlist, ensure_ascii=False, indent=2)
            )
        else:
            context_parts.append("No matched solutions were found for this query.")

        messages: list[dict] = [
            {"role": m.role, "content": m.content} for m in history if m.role in ("user", "assistant")
        ]
        user_content = "\n\n".join(context_parts) + f"\n\nUser message:\n{message}"
        messages.append({"role": "user", "content": user_content})

        yield from self.llm.stream(system=load_prompt("synthesize.md"), messages=messages)
