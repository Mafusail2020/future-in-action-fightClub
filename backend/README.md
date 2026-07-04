# Zhytomyr City Adviser — Backend

FastAPI + LangGraph agent over two RAG pools in Supabase (pgvector):

- **Problems layer** — data about Zhytomyr collected per city area ("raion" = microdistrict here): OSM, official docs, news, camera snapshots.
- **Solutions layer** — case studies of how other cities solved similar problems (ingested separately, see `ingestion/solutions/README.md`).

## Setup

1. Install [uv](https://docs.astral.sh/uv/), then:

   ```bash
   cd backend
   uv sync
   cp .env.example .env   # fill in all keys
   ```

2. Create a free [Supabase](https://supabase.com) project. Copy `SUPABASE_URL` and the
   `service_role` key into `.env` as `SUPABASE_SERVICE_KEY`.

3. Apply migrations: open the Supabase dashboard → SQL editor, paste and run each file from
   `app/db/migrations/` **in order** (0001 → 0004).

## Data pipeline

```bash
uv run python -m scripts.seed_raions          # city areas + boundaries from OSM
uv run python -m ingestion.run --source osm   # shops/roads/POIs → metrics + docs + map features
# drop PDFs into data/docs/, URLs into data/news_urls.txt / data/docs_urls.txt, then:
uv run python -m ingestion.run --source docs
uv run python -m ingestion.run --source news
uv run python -m ingestion.run --source cameras   # images in data/camera_snapshots/, named <raion-slug>__<lat>__<lng>.jpg
uv run python -m ingestion.run --source all       # everything
uv run python -m scripts.generate_digests         # per-raion digests (run after every ingest)
```

## Run

```bash
uv run uvicorn app.main:app --reload --port 8000
```

- `POST /api/v1/chat` — agent endpoint: `{"session_id": null, "message": "...", "model": "sonnet"|"haiku"}` →
  answer + citations + map GeoJSON. Interactive docs at `http://localhost:8000/docs`.
- `POST /api/v1/chat/stream` — same request, SSE response: `token` deltas → `status`
  (tool activity) → `final` (canonical payload with validated citations) / `error`.
- `GET /api/v1/cities`, `GET /api/v1/cities/{id}/cases`, `GET /api/v1/cases/{id}` —
  world-map cities and their solved-problem cases (demo data:
  `uv run python -m scripts.seed_demo_cases`).
- `GET /api/v1/raions` — areas + boundaries for the initial map render.
- `GET /api/v1/raions/{slug}/digest` — current digest for one area.
- `GET /health`

GeoJSON coordinate order is **[lng, lat]** everywhere.

## Tests

```bash
uv run pytest
```

Tests run fully offline (LLM and DB mocked).

## Layout

```
app/          FastAPI + LangGraph runtime (reads DB)
  agent/      graph, nodes, tools, prompts
  rag/        embeddings, chunking, retriever (shared with ingestion)
  db/         supabase client, repositories, migrations/
ingestion/    offline data collection (writes DB); run via `python -m ingestion.run`
  solutions/  contract for the solutions-layer ingestion (teammate's part)
scripts/      seed_raions, generate_digests
data/         curated inputs: PDFs, URL lists, camera snapshots
```
