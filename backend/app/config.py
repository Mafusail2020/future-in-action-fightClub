import os
import warnings
from functools import lru_cache

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Populate os.environ from .env so libraries that read it directly
# (langchain-anthropic, LangSmith tracing) pick the keys up too.
load_dotenv()

# LangSmith is optional: tracing without an API key would make langchain
# log an auth error on every LLM call, so turn it off up front instead.
if os.environ.get("LANGSMITH_TRACING", "").lower() == "true" and not os.environ.get(
    "LANGSMITH_API_KEY"
):
    os.environ["LANGSMITH_TRACING"] = "false"
    warnings.warn(
        "LANGSMITH_TRACING=true but LANGSMITH_API_KEY is not set — "
        "tracing disabled. Add the key to .env to see runs at smith.langchain.com.",
        stacklevel=1,
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str = ""
    supabase_service_key: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # provider:model strings understood by langchain's init_chat_model
    router_model: str = "anthropic:claude-haiku-4-5-20251001"
    main_model: str = "anthropic:claude-sonnet-4-6"

    # Shared by app and ingestion — the two sides must never diverge.
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
