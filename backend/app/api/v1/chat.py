import time
from uuid import uuid4

from fastapi import APIRouter, Depends
from langchain_core.messages import HumanMessage

from app.agent.nodes.resolve_geo import CITY_CENTER
from app.dependencies import get_graph
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.geo import MapPayload, Viewport

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, graph=Depends(get_graph)) -> ChatResponse:
    session_id = request.session_id or str(uuid4())
    started = time.perf_counter()

    state = await graph.ainvoke(
        {
            "query": request.message,
            "messages": [HumanMessage(content=request.message)],
            # Per-turn fields must be reset explicitly: the checkpointer keeps the
            # previous turn's state alive for this thread, and e.g. a chitchat turn
            # would otherwise inherit last turn's retrieved chunks.
            "retrieved_problems": [],
            "retrieved_solutions": [],
            "citations": [],
            "map_actions": [],
            "viewport": {},
            "answer": "",
        },
        config={"configurable": {"thread_id": session_id}},
    )

    viewport = state.get("viewport") or {}
    return ChatResponse(
        session_id=session_id,
        intent=state.get("intent", "problems_qa"),
        answer=state.get("answer", ""),
        citations=state.get("citations", []),
        map=MapPayload(
            actions=state.get("map_actions", []),
            viewport=Viewport(
                center=viewport.get("center") or CITY_CENTER,
                zoom=viewport.get("zoom") or 12,
            ),
        ),
        meta={"latency_ms": int((time.perf_counter() - started) * 1000)},
    )
