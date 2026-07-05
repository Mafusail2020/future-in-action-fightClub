"""User-supplied documents about their city — the substance behind search_city_state."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.db.repositories.rag import RagRepository, city_key
from app.dependencies import get_rag_repo
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed_texts, embeddings_available

router = APIRouter(prefix="/city-docs", tags=["city-docs"])


class CityDocIn(BaseModel):
    city: str = Field(min_length=1)
    country: str = Field(min_length=1)
    title: str = Field(default="Дані про місто", max_length=120)
    content: str = Field(min_length=20, max_length=100_000)
    source_url: str | None = Field(default=None, max_length=500)


@router.post("")
def add_city_doc(doc: CityDocIn, rag: RagRepository = Depends(get_rag_repo)) -> dict:
    if not embeddings_available():
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")

    key = city_key(doc.city, doc.country)
    chunks = chunk_text(doc.content)
    if not chunks:
        raise HTTPException(status_code=422, detail="Document is empty after cleanup")

    row = rag.insert_city_doc({
        "city_key": key,
        "title": doc.title.strip() or "Дані про місто",
        "kind": "pasted",
        "source_url": doc.source_url,
        "content": doc.content,
    })
    embeddings = embed_texts(chunks)
    rag.insert_city_doc_chunks([
        {"doc_id": row["id"], "city_key": key, "content": chunk, "embedding": embedding}
        for chunk, embedding in zip(chunks, embeddings)
    ])
    return {"id": row["id"], "chunks": len(chunks)}


@router.get("")
def list_city_docs(
    city: str, country: str, rag: RagRepository = Depends(get_rag_repo)
) -> list[dict]:
    return rag.list_city_docs(city_key(city, country))
