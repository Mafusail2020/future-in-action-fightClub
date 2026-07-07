# City Solutions Aggregator

Collects real city-improvement solutions from cities around the world and matches them to **your**
city — on an interactive world map with an AI adviser that reasons about your city, points at
places, and pulls up verified precedents from elsewhere.

Hackathon project (Noosphere Engineering, AI & Data track).

---

## Features

### Interactive world map
- **MapLibre GL globe** that auto-morphs to a flat projection as you zoom in.
- **City markers** from the catalog; click a city to open a panel with the solutions it has
  actually implemented.
- **Overlay modes** (precomputed per city), each animated:
  - **Population density** — a Voronoi mosaic clipped to the real admin boundary, with a
    per-cell fade-in and an opacity slider.
  - **Road condition** — a "root-growth" wave that spreads across the network.
  - **Traffic by hour** — a time-of-day slider that repaints congestion.

### AI adviser (chat)
Streaming chat (Server-Sent Events) in Ukrainian, with the model driving several tools on its own:

- **Extended thinking** — a collapsible «Роздуми» panel showing the model's reasoning, plus live
  chips for each tool it uses.
- **Smooth, frame-paced token reveal** (network bursts don't pop in).
- **`recommend_solutions`** — ranked solution cards in the chat **and** glowing markers on the map,
  only when you actually ask for solutions.
- **`direct_map`** — the model steers the map like a director: fly the camera, highlight, drop
  markers, pop leader-line callouts, draw great-circle arcs, run cinematic tours, spotlight cities.
- **`geocode_place`** — point at a specific street, square, or building inside a city.
- **`search_solutions` / `search_city_state`** — agentic pgvector RAG over the full solutions
  catalog and your city's documents, with `[S#]` citation chips that link back to sources.
- Persisted chat sessions, message edit & regenerate, and a home-city chip sent with every turn.

### City knowledge & deep dossier
- **"What the adviser knows"** — the AI city profile (region, climate, economy, problem domains,
  key challenges), shown in the sidebar.
- **Deep dossier** (on demand) — builds an enormous, cited knowledge base for **any** city:
  - hard facts from **Wikidata**, **OpenStreetMap**, and **Wikipedia** (population, area, mayor,
    twin cities, amenity counts, …),
  - **live web research** for current sources,
  - a **20-section LLM synthesis** grounded in the above.

  It streams a live "deep-dive" progress view, has a hard 5-minute cap, caches the result, and
  ingests everything so the **chat answers factual questions** (mayor, population, budget, …)
  directly, with sources. Sidebar card + full-screen panel.
- **Paste local reports** ("Дані про місто") → chunked, embedded, and citable by the adviser.

### Catalog
- Browse the full solutions catalog; each solution opens as a standalone `/solution/:id` article.

---

## Stack

- **Frontend** — React 19, TypeScript, Vite, Tailwind CSS v4, MapLibre GL v5, zustand,
  TanStack Query.
- **Backend** — FastAPI, the Anthropic SDK (Claude), OpenAI (embeddings + fallback provider),
  Supabase (Postgres + pgvector).

The agent pipeline is plain Anthropic SDK — no LangChain/LangGraph. Matching hands the whole
candidate catalog to the model (LLM-over-catalog); retrieval uses OpenAI `text-embedding-3-small`
over pgvector.

---

## Getting started

### Backend (`backend/`, via [uv](https://docs.astral.sh/uv/))

```bash
uv sync --extra dev
uv run pytest                                  # offline: LLM mocked, no DB
uv run uvicorn app.main:app --reload --port 8000
```

- **Migrations:** paste `backend/app/db/migrations/*.sql` into the Supabase SQL editor (in order).
- **`.env`:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY` (optional
  `ANTHROPIC_MODEL`, default `claude-sonnet-5`), `OPENAI_API_KEY`. Set `LLM_PROVIDER=openai` to run
  everything on OpenAI (e.g. if Anthropic credits run out).
- **Seed:** `uv run python -m scripts.load_seed`, then `uv run python -m scripts.embed_solutions`.

### Frontend (`frontend/`)

```bash
npm install
npm run dev      # port 5173, proxies /api → :8000
npm run build
```

---

## API (`/api/v1`)

`GET /cities`, `GET /cities/{id}`, `GET /solutions`, `GET /solutions/{id}`, `GET /categories`,
`POST /profile`, `POST /match`, `POST /chat` (SSE), `POST /city-docs` / `GET /city-docs`,
`GET /dossier` + `POST /dossier/deep-dive` (SSE), `GET /cities/{id}/map-modes` +
`GET /cities/{id}/map-modes/{mode}`.
