import json
import time
from uuid import uuid4

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage

from app.agent import labels
from app.agent.utils import chunk_text_delta, msg_text
from app.dependencies import get_agent_factory
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.geo import MapPayload, Viewport
from app.services import citation_service, geo_service

router = APIRouter(tags=["chat"])


def _last_ai_text(messages: list) -> str:
    for message in reversed(messages):
        if isinstance(message, AIMessage):
            return msg_text(message)
    return ""


def _finalize_turn(raw_answer: str) -> dict:
    """Validate citations + build the map payload from this run's registry."""
    labeled = labels.labeled()
    actions, viewport = geo_service.build_map_payload(list(labeled.values()))
    answer, citations, actions = citation_service.finalize(raw_answer, labeled, actions)
    return {"answer": answer, "citations": citations,
            "map_actions": actions, "viewport": viewport}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, agent_factory=Depends(get_agent_factory)) -> ChatResponse:
    session_id = request.session_id or str(uuid4())
    started = time.perf_counter()
    agent = agent_factory(request.model or "sonnet")

    labels.begin_run()
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=request.message)]},
        config={"configurable": {"thread_id": session_id}},
    )
    turn = _finalize_turn(_last_ai_text(result.get("messages", [])))

    return ChatResponse(
        session_id=session_id,
        answer=turn["answer"],
        citations=turn["citations"],
        map=MapPayload(
            actions=turn["map_actions"],
            viewport=Viewport(**turn["viewport"]),
        ),
        meta={"latency_ms": int((time.perf_counter() - started) * 1000),
              "model": request.model or "sonnet"},
    )


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, agent_factory=Depends(get_agent_factory)):
    """SSE: `token` (text deltas) → `status` (tool activity) → `final` (full payload).

    The streamed tokens are a live preview; the `final` event carries the canonical
    answer with validated [n] citations — the client must replace the preview with it.
    """
    session_id = request.session_id or str(uuid4())
    started = time.perf_counter()
    agent = agent_factory(request.model or "sonnet")
    config = {"configurable": {"thread_id": session_id}}

    async def generate():
        labels.begin_run()
        try:
            async for mode, payload in agent.astream(
                {"messages": [HumanMessage(content=request.message)]},
                config=config,
                stream_mode=["updates", "messages"],
            ):
                if mode == "messages":
                    chunk, _meta = payload
                    if isinstance(chunk, AIMessageChunk):
                        delta = chunk_text_delta(chunk)
                        if delta:
                            yield _sse("token", {"text": delta})
                else:  # updates — announce tool calls the model just decided on
                    for update in (payload or {}).values():
                        for message in (update or {}).get("messages", []):
                            for tool_call in getattr(message, "tool_calls", None) or []:
                                yield _sse("status", {"tool": tool_call["name"]})

            state = await agent.aget_state(config)
            turn = _finalize_turn(_last_ai_text(state.values.get("messages", [])))
            yield _sse("final", {
                "session_id": session_id,
                "answer": turn["answer"],
                "citations": turn["citations"],
                "map": {"actions": turn["map_actions"], "viewport": turn["viewport"]},
                "meta": {"latency_ms": int((time.perf_counter() - started) * 1000),
                         "model": request.model or "sonnet"},
            })
        except Exception as exc:  # surface as an SSE event, not a broken stream
            yield _sse("error", {"session_id": session_id, "message": str(exc)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
