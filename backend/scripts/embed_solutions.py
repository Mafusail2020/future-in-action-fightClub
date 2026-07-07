"""Embed the solutions catalog for search_solutions. Idempotent (replaces per solution).

Run from backend/ after load_seed (needs OPENAI_API_KEY):
    uv run python -m scripts.embed_solutions
"""

from __future__ import annotations

from app.db.client import get_supabase
from app.db.repositories.rag import RagRepository
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed_texts


def main() -> None:
    client = get_supabase()
    rag = RagRepository(client)
    solutions = (
        client.table("solutions")
        .select("id, title, problem, solution, outcome, cities(name, country)")
        .execute()
        .data
    )
    total_chunks = 0
    for s in solutions:
        city = s.get("cities") or {}
        text = "\n\n".join(
            part
            for part in (
                f"{s['title']} — {city.get('name')}, {city.get('country')}",
                f"Проблема: {s['problem']}",
                f"Рішення: {s['solution']}",
                f"Результат: {s['outcome']}" if s.get("outcome") else "",
            )
            if part
        )
        chunks = chunk_text(text)
        embeddings = embed_texts(chunks)
        rag.replace_solution_chunks(
            s["id"],
            [
                {"solution_id": s["id"], "content": chunk, "embedding": embedding}
                for chunk, embedding in zip(chunks, embeddings)
            ],
        )
        total_chunks += len(chunks)
        print(f"  {s['title']}: {len(chunks)} chunk(s)")
    print(f"Done: {len(solutions)} solutions, {total_chunks} chunks embedded.")


if __name__ == "__main__":
    main()
