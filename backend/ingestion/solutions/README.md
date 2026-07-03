# Solutions Layer — Ingestion Contract

Your scripts live in this directory and write to three tables (already created by
`app/db/migrations/0003_solutions.sql`). The agent only **reads** these tables — as soon as
rows appear here, "How can Zhytomyr fix X?" questions start using them. Nothing else to wire up.

## Tables you fill

1. **`cities`** — one row per city: `name`, `country`, `population` (int, required for
   "similar city" filtering!), optionally `area_km2`, `gdp_per_capita`, `climate`, `meta`.
2. **`solution_cases`** — one row per solved problem: `city_id`, `problem_domain`, `title`,
   `problem_summary`, `solution_summary`, `outcome`, `cost_estimate`, `year_start`,
   `source_urls` (text[], required — these become citations shown to the user), `full_text`.
3. **`solution_chunks`** — RAG chunks of the case text: `case_id`, `city_id`,
   `problem_domain`, `chunk_index`, `content`, `embedding`.

## Hard rules

- **Embeddings**: use `app.rag.embeddings.embed_texts` — do NOT call OpenAI yourself.
  The model is `text-embedding-3-small` @ 1536 dims; any mismatch silently breaks retrieval.
- **Chunking**: use `app.rag.chunking.chunk_text` (same ~800/120 splitter as the problems pool).
- **`problem_domain`** must be one of exactly:
  `roads | transport | commerce | demographics | utilities | safety`
  (same vocabulary the problems layer uses for `documents.category` — this is how the agent
  routes between the two pools).
- Population matters: retrieval filters cities to the 100k–600k band around Zhytomyr (~260k).
  Cases from megacities won't be found unless the user asks explicitly.

## Minimal insert flow (from backend/, after `uv sync` and filling .env)

```python
from app.db.client import get_supabase
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed_texts

sb = get_supabase()

city = sb.table("cities").upsert(
    {"name": "Rzeszów", "country": "Poland", "population": 196_000},
    on_conflict="name, country",
).execute().data[0]

case = sb.table("solution_cases").insert({
    "city_id": city["id"],
    "problem_domain": "transport",
    "title": "Intelligent traffic management system",
    "problem_summary": "...",
    "solution_summary": "...",
    "outcome": "...",
    "source_urls": ["https://..."],
    "full_text": FULL_TEXT,
}).execute().data[0]

chunks = chunk_text(FULL_TEXT)
embeddings = embed_texts(chunks)
sb.table("solution_chunks").insert([
    {"case_id": case["id"], "city_id": city["id"], "problem_domain": "transport",
     "chunk_index": i, "content": c, "embedding": e}
    for i, (c, e) in enumerate(zip(chunks, embeddings))
]).execute()
```

Test your data: `uv run python -c "from app.rag.retriever import search_solutions; print(search_solutions('traffic congestion', domain='transport'))"`
