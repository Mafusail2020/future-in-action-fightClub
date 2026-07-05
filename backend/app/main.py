"""FastAPI application entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    categories,
    chat,
    cities,
    city_docs,
    health,
    map_layers,
    match,
    profile,
    solutions,
)
from app.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="City Solutions Aggregator",
        version="0.1.0",
        description="Match city-improvement solutions from other cities to a user's city.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )
    # No global GZipMiddleware on purpose: it also wraps streaming responses and
    # zlib-buffers /chat SSE tokens. The big map-layer payloads gzip themselves
    # inside their endpoint instead (app/api/v1/map_layers.py).
    app.include_router(health.router)
    for module in (cities, solutions, categories, profile, match, chat, city_docs, map_layers):
        app.include_router(module.router, prefix="/api/v1")

    return app


app = create_app()
