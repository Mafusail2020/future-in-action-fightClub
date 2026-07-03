-- 0003: Solutions layer — how other cities solved similar problems.
-- Schema owned by the backend; rows are written by the solutions ingestion
-- (see ingestion/solutions/README.md). The agent only reads these tables.

create table cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  population int,                          -- primary "similar city" filter
  area_km2 numeric,
  gdp_per_capita numeric,
  climate text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (name, country)
);

create table solution_cases (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities(id),
  problem_domain text not null,            -- shared vocabulary: roads|transport|commerce|demographics|utilities|safety
  title text not null,
  problem_summary text,
  solution_summary text,
  outcome text,                            -- measurable result, if known
  cost_estimate text,
  year_start int,
  year_end int,
  source_urls text[] not null default '{}',
  full_text text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index solution_cases_domain_idx on solution_cases (problem_domain);

create table solution_chunks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references solution_cases(id) on delete cascade,
  city_id uuid references cities(id),      -- denormalized for filtered vector search
  problem_domain text,
  chunk_index int not null,
  content text not null,
  embedding vector(1536)                   -- MUST be text-embedding-3-small, same as problems layer
);
create index solution_chunks_embedding_idx on solution_chunks using hnsw (embedding vector_cosine_ops);
create index solution_chunks_domain_idx on solution_chunks (problem_domain);
