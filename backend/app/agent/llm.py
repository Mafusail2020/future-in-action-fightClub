"""Thin wrapper around the Anthropic SDK.

Two helpers the pipeline needs:
- structured(): force a tool call and return its validated JSON input (reliable structured output).
- stream(): yield answer text token-by-token for SSE.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from anthropic import Anthropic

from app.config import get_settings

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8")


class LLM:
    def __init__(self, api_key: str | None = None, model: str | None = None):
        settings = get_settings()
        key = api_key or settings.anthropic_api_key
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")
        self.client = Anthropic(api_key=key)
        self.model = model or settings.anthropic_model

    def structured(
        self,
        system: str,
        prompt: str,
        schema: dict,
        tool_name: str = "emit",
        max_tokens: int = 4096,
    ) -> dict:
        """Return the model's structured output as a dict, via a forced tool call."""
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            tools=[
                {
                    "name": tool_name,
                    "description": "Emit the structured result.",
                    "input_schema": schema,
                }
            ],
            tool_choice={"type": "tool", "name": tool_name},
        )
        for block in resp.content:
            if block.type == "tool_use":
                return dict(block.input)
        raise RuntimeError("Model did not return a tool call")

    def stream(
        self,
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
    ) -> Iterator[str]:
        with self.client.messages.stream(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        ) as s:
            yield from s.text_stream
