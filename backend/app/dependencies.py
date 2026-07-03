from functools import lru_cache


@lru_cache
def get_graph():
    """Compiled agent graph, built once per process (holds the MemorySaver sessions)."""
    from app.agent.graph import build_graph

    return build_graph()
