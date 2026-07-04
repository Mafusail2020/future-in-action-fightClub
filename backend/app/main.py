"""FastAPI application entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import categories, chat, cities, health, match, profile, solutions
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

    app.include_router(health.router)
    for module in (cities, solutions, categories, profile, match, chat):
        app.include_router(module.router, prefix="/api/v1")

    return app


app = create_app()
