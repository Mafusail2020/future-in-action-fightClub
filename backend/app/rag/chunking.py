"""Paragraph-aware text splitter. No heavy deps — ~800-char chunks, soft overlap."""

from __future__ import annotations

CHUNK_SIZE = 800
OVERLAP = 100


def chunk_text(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= CHUNK_SIZE:
        return [text]

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""

    def flush() -> None:
        nonlocal current
        if current.strip():
            chunks.append(current.strip())
        current = ""

    for paragraph in paragraphs:
        # Oversized paragraph: hard-split with overlap.
        while len(paragraph) > CHUNK_SIZE:
            flush()
            chunks.append(paragraph[:CHUNK_SIZE].strip())
            paragraph = paragraph[CHUNK_SIZE - OVERLAP :]
        if len(current) + len(paragraph) + 2 > CHUNK_SIZE:
            flush()
        current = f"{current}\n\n{paragraph}" if current else paragraph
    flush()
    return chunks
