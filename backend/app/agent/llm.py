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


def make_llm(model: str | None = None):
    """Provider fallback: Anthropic when its key exists, else OpenAI runs
    everything (the `model` override only applies to its own provider)."""
    settings = get_settings()
    if settings.anthropic_api_key:
        return LLM(model=model)
    if settings.openai_api_key:
        from app.agent.llm_openai import OpenAILLM

        return OpenAILLM()  # claude model ids don't apply here
    raise RuntimeError("Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is configured")


class LLM:
    def __init__(self, api_key: str | None = None, model: str | None = None):
        settings = get_settings()
        key = api_key or settings.anthropic_api_key
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")
        # Retry transient connection blips: the tool loop opens several requests
        # per turn, so any one connect failure would otherwise abort the answer.
        self.client = Anthropic(api_key=key, max_retries=4)
        self.model = model or settings.anthropic_model

    def structured(
        self,
        system: str,
        prompt: str,
        schema: dict,
        tool_name: str = "emit",
        max_tokens: int = 4096,
        thinking: dict | None = None,
    ) -> dict:
        """Return the model's structured output as a dict, via a forced tool call.

        `thinking` is an optional override (e.g. {"type": "disabled"} for a fast,
        grounded extraction where deep reasoning isn't needed)."""
        extra = {"thinking": thinking} if thinking is not None else {}
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
            **extra,
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
        max_tokens: int = 6000,
        max_rounds: int = 12,
        effort: str = "medium",
    ) -> Iterator[dict]:
        """Stream reasoning + answer + tool work as typed events.

        Yields dicts: {"type": "thinking"|"text", "text": ...} for streamed
        deltas, and {"type": "tool", "name": ...} the moment the model decides to
        call a tool. Every tool_use fires on_tool(name, input); its return value
        (or "ok") goes back as the tool_result and the turn continues, so the
        model can interleave reasoning, prose and tool calls.

        Adaptive thinking with `display: "summarized"` (Claude 5 / 4.7+): the
        model decides how much to think; we surface a readable summary. The old
        `budget_tokens` form is rejected with a 400 on these models.
        """
        convo = list(messages)
        for _ in range(max_rounds):
            with self.client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=convo,
                tools=tools,
                thinking={"type": "adaptive", "display": "summarized"},
                output_config={"effort": effort},
            ) as s:
                for event in s:
                    if event.type == "content_block_delta":
                        delta = event.delta
                        if delta.type == "thinking_delta":
                            yield {"type": "thinking", "text": delta.thinking}
                        elif delta.type == "text_delta":
                            yield {"type": "text", "text": delta.text}
                final = s.get_final_message()

            if final.stop_reason != "tool_use":
                return

            results = []
            for block in final.content:
                if block.type == "tool_use":
                    yield {"type": "tool", "name": block.name}
                    outcome = on_tool(block.name, dict(block.input))
                    results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": outcome if outcome is not None else "ok",
                    })
            # final.content keeps the thinking blocks (with signatures) — required
            # when passing tool results back with extended thinking enabled.
            convo.append({"role": "assistant", "content": final.content})
            convo.append({"role": "user", "content": results})
