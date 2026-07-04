"""Per-request registry of retrieved items → stable [S#] citation labels.

Tools register every item they return and embed the label in their JSON payload,
so the model can only cite labels that exist in the registry. After the run the
registry is exactly the `labeled` dict `citation_service.finalize()` expects.

A ContextVar isolates concurrent requests. Tools may run in a worker thread, but
langchain copies the current context into it, so the thread sees the same dict
object — mutation is visible to the caller. Never `.set()` inside a tool.
"""

from contextvars import ContextVar
from typing import Any

_registry: ContextVar[dict[int, dict[str, Any]] | None] = ContextVar(
    "citation_label_registry", default=None
)


def begin_run() -> None:
    """Start a fresh registry for this request. Call once per agent run."""
    _registry.set({})


def labeled() -> dict[int, dict[str, Any]]:
    """Everything registered so far in this run: {label_number: item}."""
    return dict(_registry.get() or {})


def label_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Register items (dedup by 'id') and stamp each with its label, e.g. 'S3'."""
    registry = _registry.get()
    if registry is None:  # tool called outside an agent run (tests, scripts)
        registry = {}
        _registry.set(registry)
    by_id = {item.get("id"): n for n, item in registry.items()}
    for item in items:
        n = by_id.get(item.get("id"))
        if n is None:
            n = len(registry) + 1
            registry[n] = item
            by_id[item.get("id")] = n
        item["label"] = f"S{n}"
    return items
