"""OpenAI-backed LLM with the same interface as the Anthropic wrapper.

Fallback provider: when ANTHROPIC_API_KEY is absent but OPENAI_API_KEY is set,
the whole agent (profile / match / chat / map tools) runs on OpenAI.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator

from openai import OpenAI

from app.config import get_settings


def _to_openai_tool(tool: dict) -> dict:
    """Anthropic tool definition -> OpenAI function-calling format."""
    return {
        "type": "function",
        "function": {
            "name": tool["name"],
            "description": tool.get("description", ""),
            "parameters": tool["input_schema"],
        },
    }


class OpenAILLM:
    def __init__(self, api_key: str | None = None, model: str | None = None):
        settings = get_settings()
        key = api_key or settings.openai_api_key
        if not key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        self.client = OpenAI(api_key=key)
        self.model = model or settings.openai_model

    def structured(
        self,
        system: str,
        prompt: str,
        schema: dict,
        tool_name: str = "emit",
        max_tokens: int = 4096,
        thinking: dict | None = None,  # accepted for parity; OpenAI path has no thinking control
    ) -> dict:
        resp = self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            tools=[_to_openai_tool({"name": tool_name, "description": "Emit the structured result.", "input_schema": schema})],
            tool_choice={"type": "function", "function": {"name": tool_name}},
        )
        calls = resp.choices[0].message.tool_calls or []
        for call in calls:
            if call.function.name == tool_name:
                return json.loads(call.function.arguments)
        raise RuntimeError("Model did not return a tool call")

    def stream(
        self,
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
    ) -> Iterator[str]:
        stream = self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, *messages],
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta

    def stream_with_tools(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict],
        on_tool: Callable[[str, dict], str | None],
        max_tokens: int = 2048,
        max_rounds: int = 12,
        effort: str = "medium",  # accepted for parity; OpenAI path has no extended thinking
    ) -> Iterator[dict]:
        """Same typed-event contract as the Anthropic wrapper, minus thinking:
        yields {"type": "text"|"tool", ...}."""
        convo: list[dict] = [{"role": "system", "content": system}, *messages]
        openai_tools = [_to_openai_tool(t) for t in tools]

        for _ in range(max_rounds):
            stream = self.client.chat.completions.create(
                model=self.model,
                max_completion_tokens=max_tokens,
                messages=convo,
                tools=openai_tools,
                stream=True,
            )
            content = ""
            calls: dict[int, dict] = {}  # index -> {id, name, arguments}
            finish = None
            for chunk in stream:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                if choice.delta.content:
                    content += choice.delta.content
                    yield {"type": "text", "text": choice.delta.content}
                for tc in choice.delta.tool_calls or []:
                    slot = calls.setdefault(tc.index, {"id": "", "name": "", "arguments": ""})
                    if tc.id:
                        slot["id"] = tc.id
                    if tc.function and tc.function.name:
                        slot["name"] = tc.function.name
                    if tc.function and tc.function.arguments:
                        slot["arguments"] += tc.function.arguments
                if choice.finish_reason:
                    finish = choice.finish_reason

            if finish != "tool_calls" or not calls:
                return

            assistant_msg: dict = {
                "role": "assistant",
                "content": content or None,
                "tool_calls": [
                    {
                        "id": c["id"],
                        "type": "function",
                        "function": {"name": c["name"], "arguments": c["arguments"] or "{}"},
                    }
                    for c in calls.values()
                ],
            }
            convo.append(assistant_msg)
            for c in calls.values():
                yield {"type": "tool", "name": c["name"]}
                try:
                    args = json.loads(c["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {}
                outcome = on_tool(c["name"], args)
                convo.append({
                    "role": "tool",
                    "tool_call_id": c["id"],
                    "content": outcome if outcome is not None else "ok",
                })
