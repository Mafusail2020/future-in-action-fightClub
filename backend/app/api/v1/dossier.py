"""Deep city dossier: a cached GET for the enormous knowledge panel, and an SSE
'deep-dive' that builds it live so the UI can show the research happening."""

import json
import threading
from queue import SimpleQueue

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agent.llm import make_llm
from app.dependencies import get_dossier_builder
from app.research.dossier import DossierBuilder

router = APIRouter(tags=["dossier"])


class DossierRequest(BaseModel):
    city: str
    country: str
    model: str | None = None


@router.get("/dossier")
def get_dossier(
    city: str,
    country: str,
    builder: DossierBuilder = Depends(get_dossier_builder),
) -> dict:
    """Return the cached deep dossier, or {dossier: null} if it hasn't been built
    yet (the UI then offers the live deep-dive)."""
    cached = builder.get_cached(city, country)
    return {"dossier": cached.model_dump_ui() if cached else None}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/dossier/deep-dive")
def deep_dive(
    req: DossierRequest,
    builder: DossierBuilder = Depends(get_dossier_builder),
) -> StreamingResponse:
    """Build the dossier and stream progress: `progress`* → `dossier` → `done`
    (or `error`). The heavy build runs in a worker thread; progress callbacks are
    marshalled onto the SSE stream through a queue."""
    if req.model:
        builder.llm = make_llm(model=req.model)

    def event_stream():
        q: SimpleQueue = SimpleQueue()
        result: dict = {}
        SENTINEL = object()

        def on_progress(stage: str, data: dict) -> None:
            q.put(("progress", {"stage": stage, **data}))

        def run():
            try:
                result["dossier"] = builder.build(req.city, req.country, on_progress=on_progress)
            except Exception as exc:  # noqa: BLE001 — surfaced as an SSE error frame
                result["error"] = str(exc)
            finally:
                q.put((SENTINEL, None))

        threading.Thread(target=run, daemon=True).start()

        while True:
            kind, payload = q.get()
            if kind is SENTINEL:
                break
            yield _sse("progress", payload)

        if "error" in result:
            yield _sse("error", {"message": result["error"]})
        else:
            yield _sse("dossier", result["dossier"].model_dump_ui())
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
