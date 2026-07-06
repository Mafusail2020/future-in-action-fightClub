"""Application settings loaded from environment / .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str = ""
    supabase_service_key: str = ""

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"

    # RAG embeddings; also the fallback LLM provider when the Anthropic key
    # is missing (agentic search tools degrade gracefully without it)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # OSM geometry source for map layers; kumi.systems mirror is a drop-in fallback:
    # OVERPASS_URL=https://overpass.kumi.systems/api/interpreter
    overpass_url: str = "https://overpass-api.de/api/interpreter"

    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
