"""The agent: one prebuilt tool-calling loop over all four tools (no custom graph).

Built lazily and cached per model alias so importing this module never needs API
keys. Both aliases share one MemorySaver, so a session keeps its history when the
user switches models mid-conversation.
"""

from functools import lru_cache
from typing import Literal

from langchain.agents import create_agent
from langgraph.checkpoint.memory import MemorySaver

from app.agent.tools.geo_lookup import geo_lookup
from app.agent.tools.problems_search import problems_search
from app.agent.tools.raion_stats import raion_stats
from app.agent.tools.solutions_search import solutions_search
from app.agent.utils import load_prompt
from app.config import get_settings

ModelAlias = Literal["sonnet", "haiku"]


@lru_cache
def _memory() -> MemorySaver:
    return MemorySaver()


@lru_cache
def get_agent(alias: ModelAlias = "sonnet"):
    settings = get_settings()
    model = {"sonnet": settings.main_model, "haiku": settings.router_model}[alias]
    return create_agent(
        model,
        tools=[problems_search, raion_stats, geo_lookup, solutions_search],
        system_prompt=load_prompt("agent"),
        checkpointer=_memory(),
    )
