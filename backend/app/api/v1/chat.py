import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.agent.pipeline import Agent
from app.dependencies import get_agent
from app.domain.models import ChatRequest

router = APIRouter(tags=["agent"])


@router.post("/chat")
def chat(req: ChatRequest, agent: Agent = Depends(get_agent)) -> StreamingResponse:
    """Server-Sent Events. Emits a `matches` event (for the map), then `token` events, then `done`."""

    def event_stream():
        profile = None
        matches = []
        if req.city and req.country:
            profile, matches = agent.recommend(req.city, req.country, req.limit)
            payload = {
                "profile": profile.model_dump(mode="json"),
                "matches": [m.model_dump(mode="json") for m in matches],
            }
            yield f"event: matches\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

        for token in agent.answer_stream(req.message, profile, matches, req.history):
            yield f"event: token\ndata: {json.dumps({'text': token}, ensure_ascii=False)}\n\n"

        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
