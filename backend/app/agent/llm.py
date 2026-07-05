"""Thin wrapper around the Anthropic SDK.

Two helpers the pipeline needs:
- structured(): force a tool call and return its validated JSON input (reliable structured output).
- stream(): yield answer text token-by-token for SSE.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
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

    def stream_with_tools(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict],
        on_tool: Callable[[str, dict], str | None],
        max_tokens: int = 2048,
        max_rounds: int = 12,
    ) -> Iterator[str]:
        """Stream text while letting the model call tools mid-answer.

        Yields text deltas. Every tool_use block fires on_tool(name, input); its
        return value (or "ok" for fire-and-forget tools) goes back as the
        tool_result, then the stream continues in the same turn — the model
        interleaves prose with tool work.
        """
        convo = list(messages)
        for _ in range(max_rounds):
            with self.client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=convo,
                tools=tools,
            ) as s:
                yield from s.text_stream
                final = s.get_final_message()

            if final.stop_reason != "tool_use":
                return

            results = []
            for block in final.content:
                if block.type == "tool_use":
                    outcome = on_tool(block.name, dict(block.input))
                    results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": outcome if outcome is not None else "ok",
                    })
            convo.append({"role": "assistant", "content": final.content})
            convo.append({"role": "user", "content": results})
