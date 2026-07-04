from typing import Callable


def get_agent_factory() -> Callable:
    """Returns the per-model-alias agent factory (overridable in tests)."""
    from app.agent.agent import get_agent

    return get_agent
