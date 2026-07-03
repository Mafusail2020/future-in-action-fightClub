"""Shared helpers for agent nodes: prompt loading, lazy LLM singletons, tool-result capture."""

import json
from functools import lru_cache
from pathlib import Path

from langchain.chat_models import init_chat_model
from langchain_core.messages import BaseMessage, ToolMessage

from app.config import get_settings

_PROMPTS_DIR = Path(__file__).parent / "prompts"
_MAX_ITEMS = 40


def load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / f"{name}.md").read_text()


# Lazy so that importing agent modules never requires API keys (tests run offline).
@lru_cache
def router_llm():
    return init_chat_model(get_settings().router_model, temperature=0)


@lru_cache
def main_llm(temperature: float = 0.0):
    return init_chat_model(get_settings().main_model, temperature=temperature)


def msg_text(message: BaseMessage) -> str:
    text = getattr(message, "text", None)
    if isinstance(text, str):  # langchain-core >= 1.0: property (a callable str shim)
        return text or str(message.content)
    if callable(text):  # langchain-core < 1.0: method
        return text() or str(message.content)
    return str(message.content)


def collect_items(messages: list[BaseMessage]) -> list[dict]:
    """Pull retrieved items out of ToolMessages produced by a react subgraph run.

    Every tool returns json.dumps({"items": [...]}) where each item carries an "id" —
    this is what makes citations verifiable: the synthesizer can only reference
    items that actually came back from a tool.
    """
    items: list[dict] = []
    seen: set[str] = set()
    for message in messages:
        if not isinstance(message, ToolMessage):
            continue
        try:
            payload = json.loads(msg_text(message))
        except (json.JSONDecodeError, TypeError):
            continue
        for item in payload.get("items", []):
            if isinstance(item, dict) and item.get("id") and item["id"] not in seen:
                seen.add(item["id"])
                items.append(item)
    return items[:_MAX_ITEMS]
