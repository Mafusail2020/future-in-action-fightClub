from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import chat, health, raions
from app.config import get_settings
from app.dependencies import get_graph


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_graph()  # compile the agent graph once at startup, not on first request
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Zhytomyr City Adviser API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(chat.router, prefix="/api/v1")
    app.include_router(raions.router, prefix="/api/v1")
    return app


app = create_app()
