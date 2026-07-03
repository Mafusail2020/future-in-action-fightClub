"""LLM classification for ingested texts that lack explicit category/raion labels."""

from typing import Literal

from langchain.chat_models import init_chat_model
from pydantic import BaseModel, Field

from app.config import get_settings
from app.db.repositories.raions import list_raions

Category = Literal["roads", "transport", "commerce", "demographics", "utilities", "safety"]


class DocClassification(BaseModel):
    category: Category | None = Field(description="Best-fitting problem category, or null")
    raion_slug: str | None = Field(
        description="Slug of the single city area the text is mostly about, or null if city-wide"
    )
    title: str = Field(description="Short descriptive title for the document")


def classify_document(text: str, title_hint: str | None = None) -> DocClassification:
    raion_lines = "\n".join(
        f"- {r['slug']}: {r['name_uk']}" for r in list_raions()
    )
    llm = init_chat_model(get_settings().router_model, temperature=0)
    prompt = (
        "Classify this text about the city of Zhytomyr.\n"
        f"Known city areas (slug: name):\n{raion_lines}\n\n"
        f"Title hint: {title_hint or 'none'}\n\n"
        f"Text (may be Ukrainian):\n{text[:4000]}"
    )
    return llm.with_structured_output(DocClassification).invoke(prompt)
