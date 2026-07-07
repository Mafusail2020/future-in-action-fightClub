import json
from queue import Empty, SimpleQueue

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.agent.llm import make_llm
from app.agent.map_ops import MAX_OPS_PER_TURN, validate_op
from app.agent.pipeline import Agent
from app.dependencies import get_agent
from app.domain.models import ChatRequest

router = APIRouter(tags=["agent"])


@router.post("/chat")
def chat(req: ChatRequest, agent: Agent = Depends(get_agent)) -> StreamingResponse:
    """SSE: `matches` (map shortlist) → `token`/`map_op` interleaved → `done`.

    `map_op` events are the model directing the map (validated against the city
    catalog; invalid ops are dropped, never break the stream).
    """
    if req.model:  # per-request model override (agent instance is per-request)
        agent.llm = make_llm(model=req.model)

    def event_stream():
        try:
            # Build (cached) city profile for context only — solutions are NOT
            # matched up front; the model calls recommend_solutions when wanted.
            profile = None
            if req.city and req.country:
                profile = agent.build_profile(req.city, req.country)

            known_ids = {c["id"] for c in agent.cities.list_with_counts()}
            ops_sent = 0
            pending: SimpleQueue[str] = SimpleQueue()  # queued SSE frames
            sources: dict[str, dict] = {}

            def on_map_op(raw: dict) -> None:
                nonlocal ops_sent
                if ops_sent >= MAX_OPS_PER_TURN:
                    return
                op = validate_op(raw, known_ids)
                if op is not None:
                    ops_sent += 1
                    pending.put(f"event: map_op\ndata: {json.dumps(op, ensure_ascii=False)}\n\n")

            def on_matches(matches) -> None:
                payload = {
                    "profile": profile.model_dump(mode="json") if profile else None,
                    "matches": [m.model_dump(mode="json") for m in matches],
                }
                pending.put(f"event: matches\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n")

            def flush():
                while True:
                    try:
                        yield pending.get_nowait()
                    except Empty:
                        break

            for ev in agent.answer_stream(
                req.message,
                profile,
                req.history,
                limit=req.limit,
                on_map_op=on_map_op,
                on_matches=on_matches,
                sources_out=sources,
            ):
                # Map ops / match cards queued in callbacks flush at event boundaries.
                yield from flush()
                kind = ev.get("type")
                if kind == "text":
                    yield f"event: token\ndata: {json.dumps({'text': ev['text']}, ensure_ascii=False)}\n\n"
                elif kind == "thinking":
                    yield f"event: thinking\ndata: {json.dumps({'text': ev['text']}, ensure_ascii=False)}\n\n"
                elif kind == "tool":
                    yield f"event: tool\ndata: {json.dumps({'name': ev['name']}, ensure_ascii=False)}\n\n"

            yield from flush()  # trailing ops / matches after the last event

            if sources:  # label -> source map for [S#] citation chips
                yield f"event: sources\ndata: {json.dumps(sources, ensure_ascii=False)}\n\n"

            yield "event: done\ndata: {}\n\n"
        except Exception as exc:  # surface as an SSE event instead of a dead connection
            yield f"event: error\ndata: {json.dumps({'message': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
