-- 0002: Problems layer — Zhytomyr data by city area.
-- "raion" here means any mapped city area (we use ~10 microdistricts, not the 2 official raions).

create table raions (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,               -- 'krosha', 'malovanka', ...
  name_uk text not null,
  name_en text,
  centroid_lat double precision,
  centroid_lng double precision,
  boundary_geojson jsonb,                  -- GeoJSON geometry (Polygon), served to frontend as-is
  population int,
  area_km2 numeric,
  created_at timestamptz not null default now()
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('camera','official_doc','public_doc','news','osm','manual')),
  name text not null,
  url text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (kind, name)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id),
  raion_id uuid references raions(id),     -- null = city-wide document
  title text not null,
  doc_type text,                           -- 'camera_report','budget','decision','article','dataset','osm_profile'
  category text,                           -- shared vocabulary: roads|transport|commerce|demographics|utilities|safety
  url text,
  published_at date,
  raw_storage_path text,                   -- Supabase Storage path to the original file, if any
  content text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index documents_raion_idx on documents (raion_id);

create table doc_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  raion_id uuid references raions(id),     -- denormalized from documents for filtered vector search
  category text,
  chunk_index int not null,
  content text not null,
  embedding vector(1536)                   -- text-embedding-3-small
);
create index doc_chunks_embedding_idx on doc_chunks using hnsw (embedding vector_cosine_ops);
create index doc_chunks_filter_idx on doc_chunks (raion_id, category);

-- Hard numbers the agent queries via SQL tool, not via RAG.
create table raion_metrics (
  id bigint generated always as identity primary key,
  raion_id uuid not null references raions(id),
  metric text not null,                    -- 'shop_count','shop_density_per_km2','road_length_km','pothole_count',...
  value numeric not null,
  unit text,
  measured_at timestamptz not null default now(),
  source_id uuid references sources(id),
  meta jsonb not null default '{}'
);
create index raion_metrics_idx on raion_metrics (raion_id, metric);

-- Highlightable geometry: potholes, cameras, POI clusters, congestion zones.
create table map_features (
  id uuid primary key default gen_random_uuid(),
  raion_id uuid references raions(id),
  feature_type text not null,              -- 'pothole','camera','school','pharmacy','market','congestion_zone',...
  label text,
  geometry jsonb not null,                 -- GeoJSON geometry, coordinates as [lng, lat]
  properties jsonb not null default '{}',
  document_id uuid references documents(id),  -- provenance -> citations
  observed_at timestamptz
);
create index map_features_idx on map_features (raion_id, feature_type);

create table raion_digests (
  id uuid primary key default gen_random_uuid(),
  raion_id uuid not null references raions(id),
  content text not null,                   -- markdown
  embedding vector(1536),
  generated_at timestamptz not null default now(),
  is_current boolean not null default true
);
create index raion_digests_current_idx on raion_digests (raion_id) where is_current;
