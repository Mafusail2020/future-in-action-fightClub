"""Shared helpers for the agent: prompt loading, message text extraction."""

from pathlib import Path

from langchain_core.messages import BaseMessage

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / f"{name}.md").read_text()


def msg_text(message: BaseMessage) -> str:
    text = getattr(message, "text", None)
    if isinstance(text, str):  # langchain-core >= 1.0: property
        return text or str(message.content)
    if callable(text):  # langchain-core < 1.0: method
        return text() or str(message.content)
    return str(message.content)


def chunk_text_delta(chunk: BaseMessage) -> str:
    """Visible text of a streamed message chunk; empty for tool-call-only chunks."""
    text = getattr(chunk, "text", None)
    if isinstance(text, str):  # langchain-core >= 1.0: property (callable str shim)
        return text
    if callable(text):  # langchain-core < 1.0: method
        result = text()
        return result if isinstance(result, str) else ""
    return ""
