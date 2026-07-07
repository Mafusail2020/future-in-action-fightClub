"""Live web research via the Anthropic web_search server tool.

Runs real searches about a city, captures the actual source URLs, and returns a
grounded Ukrainian briefing plus the sources so the dossier can cite live pages.
Anthropic-only and best-effort: with no Anthropic key, or on any error, it
returns empty and the dossier falls back to open data + LLM synthesis.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from anthropic import Anthropic

from app.config import get_settings
from app.domain.dossier import DossierSource

_SYSTEM = (
    "You are a research analyst building a briefing on a city for urban-policy work. "
    "Use web_search to gather CURRENT, verifiable facts. Prefer official city/government "
    "sources, statistics agencies, and reputable news. Write a concise briefing in "
    "UKRAINIAN, grouped by topic, stating concrete facts you found (with numbers where "
    "possible). Do not invent anything you did not find."
)

_TOPICS = (
    "бюджет і врядування; енергетика та теплопостачання; транспорт і дороги; "
    "демографія та внутрішньо переміщені особи; значні події останніх 2 років"
)


@dataclass
class WebResearch:
    briefing: str = ""
    sources: list[DossierSource] = field(default_factory=list)


def research_web(
    city: str,
    country: str,
    on_progress: Callable[[str, dict], None] | None = None,
) -> WebResearch:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return WebResearch()

    def progress(stage: str, **data):
        if on_progress:
            on_progress(stage, data)

    # Cap each web_search request (90s, no retries) so a stall can't hang the
    # build; the dossier orchestrator also gates this whole phase on its global
    # 5-minute budget. On timeout the outer try/except returns whatever sources
    # were gathered so far, and synthesis proceeds on open data alone.
    client = Anthropic(api_key=settings.anthropic_api_key, max_retries=0, timeout=90.0)
    model = settings.anthropic_model
    user = (
        f"Місто: {city}, {country}. Дослідіть і стисло опишіть українською такі теми: {_TOPICS}. "
        "Для кожної — конкретні факти й цифри, які знайшли у джерелах."
    )
    messages: list[dict] = [{"role": "user", "content": user}]
    # max_uses bounds total searches so the deep-dive stays demo-fast (and cheap).
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 5}]

    briefing_parts: list[str] = []
    sources: dict[str, DossierSource] = {}  # url -> source
    progress("web:start")
    try:
        for _ in range(2):  # bounded: server may pause_turn between search rounds
            resp = client.messages.create(
                model=model,
                max_tokens=3000,
                system=_SYSTEM,
                messages=messages,
                tools=tools,
                thinking={"type": "disabled"},  # the synthesis step does the reasoning; keep this fast
            )
            for block in resp.content:
                if block.type == "text":
                    briefing_parts.append(block.text)
                elif block.type == "web_search_tool_result":
                    items = block.content if isinstance(block.content, list) else []
                    for r in items:
                        url = getattr(r, "url", None)
                        title = getattr(r, "title", None) or url
                        if url and url not in sources:
                            sources[url] = DossierSource(
                                id=f"W{len(sources) + 1}", title=title[:120], url=url, kind="web"
                            )
                    progress("web:searching", found=len(sources))
            if resp.stop_reason == "pause_turn":
                messages = [messages[0], {"role": "assistant", "content": resp.content}]
                continue
            break
    except Exception as exc:  # web research is enrichment, never fatal
        print(f"web research failed: {exc}")

    progress("web:done", found=len(sources))
    return WebResearch(
        briefing="\n\n".join(p for p in briefing_parts if p.strip()),
        sources=list(sources.values())[:20],
    )
