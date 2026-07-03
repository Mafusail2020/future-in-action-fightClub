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
   `app/db/migrations/` **in order** (0001 → 0005).

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

### API scrapers (live external data, no keys needed)

| source | data | refresh (TTL) |
|---|---|---|
| `saveecobot` | city air quality AQI + meteo + gamma ([attribution required](https://www.saveecobot.com/maps/zhytomyr)) | 1 h |
| `citybudget` | community budget incomes/expenses from council decision annexes on data.gov.ua | 30 d |
| `prozorro` | active city tenders (roads/transport/utilities/lighting) as problem signals | 24 h |

```bash
uv run python -m ingestion.run --source saveecobot           # respects cache TTL
uv run python -m ingestion.run --source prozorro --force     # bypass cache
```

Raw responses are cached in `data/raw/api/`. Re-running a scraper replaces its
documents (stable `external_id`) and appends metrics as a time series — safe to
run repeatedly. Metrics without an area are **city-wide**: the agent reads them
via `raion_stats` with no `raion_slug`.

## Run

```bash
uv run uvicorn app.main:app --reload --port 8000
```

- `POST /api/v1/chat` — main agent endpoint: `{"session_id": null, "message": "..."}` →
  answer + citations + map GeoJSON. Interactive docs at `http://localhost:8000/docs`.
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
