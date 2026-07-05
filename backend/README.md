# City Solutions Aggregator — Backend

Matches city-improvement solutions from cities worldwide to a user's city. A user names their
city; an agent builds a profile of it and its likely problems, then recommends solutions that
*other* cities already implemented — categorized and geo-located for a world map.

## Stack

- **FastAPI** (Python 3.12, managed with `uv`)
- **Supabase** (Postgres + pgvector for the agent's RAG tools)
- **Claude** via the Anthropic SDK for the agent (profile / match / chat / map director)
- Matching is **LLM-over-catalog** (whole candidate set ranked by Claude); on top of it the
  chat agent has **agentic RAG tools** (OpenAI `text-embedding-3-small` @1536) it calls
  mid-answer, with `[S#]` source labels the client renders as citation chips.

## Architecture

```
user city ─▶ build_profile (Claude, cached + auto-ingested as a searchable doc)
          ─▶ select_candidates (filter catalog by category)
          ─▶ match (Claude ranks the catalog) ─▶ synthesize (Claude, streamed, with tools:
               direct_map · search_solutions · search_city_state)
Supabase: cities, solutions(+chunks), city_docs(+chunks), profiles(cache)
```

Key modules: `app/agent/pipeline.py` (orchestration), `app/agent/llm.py` (Anthropic wrapper +
tool-use streaming loop), `app/agent/map_ops.py` (validated map vocabulary),
`app/agent/search_tools.py` (RAG tools + [S#] registry), `app/rag/` (embeddings, chunking),
`app/db/repositories/` (data access), `app/api/v1/` (routes), `app/domain/` (models + categories).

## Setup

```bash
cd backend
uv sync --extra dev
cp .env.example .env        # then fill in the values
```

Fill `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY` (optionally
`ANTHROPIC_MODEL`, default `claude-sonnet-5`), and `OPENAI_API_KEY` for the RAG search
tools (without it the agent still works — search tools just stay off).

Apply the schema: open the Supabase SQL editor and run `app/db/migrations/0001_schema.sql`
(or `0002_reset_from_legacy.sql` if the project held the pre-pivot tables), then
`app/db/migrations/0003_rag.sql`.

Load the seed data and embed it:

```bash
uv run python -m scripts.load_seed
uv run python -m scripts.embed_solutions   # needs OPENAI_API_KEY
```

Run the API:

```bash
uv run uvicorn app.main:app --reload --port 8000
```

Docs at http://localhost:8000/docs.

## Endpoints (prefix `/api/v1`, except `/health`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/api/v1/cities` | All cities + `solution_count` (world map) |
| GET | `/api/v1/cities/{id}` | City + its solutions (click-city popup) |
| GET | `/api/v1/solutions` | Filter by `category`, `city_id`, `q` |
| GET | `/api/v1/solutions/{id}` | Solution detail |
| GET | `/api/v1/categories` | Category vocabulary + labels |
| POST | `/api/v1/profile` | `{city, country}` → generated city profile |
| POST | `/api/v1/match` | `{city, country, limit}` → ranked solutions from other cities |
| POST | `/api/v1/chat` | `{message, city?, country?, history?}` → SSE stream |

`/chat` emits SSE events: `matches` (profile + matched solutions, for the map), then `token`
events (answer text), then `done`.

## Data

`seed/solutions.json` — ~30 real city solutions across all 12 categories, each with a city block
(name, country, lat/lng) and `source_urls`.

> ⚠️ The `source_urls` are LLM-drafted starting points. **Spot-check them before the demo** and
> extend the seed toward ~100 entries for richer matching.

Category vocabulary lives in `app/domain/categories.py` and is mirrored by the CHECK constraint in
the migration — keep them in sync.

## Tests

```bash
uv run pytest
```

`test_health.py` (endpoint smoke) and `test_matching.py` (pipeline with a mocked Anthropic client —
no network, no DB).

## Out of scope (for now)

Live scraping, embeddings/pgvector, LangGraph, auth. The `profiles` table caches generated profiles.
A scraper can be added later behind the same schema without touching the API.
