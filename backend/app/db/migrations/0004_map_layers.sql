-- 0004: precomputed per-city map overlay layers.
-- Geometry comes from OSM Overpass; values are scored offline by an LLM
-- (scripts/build_map_layers.py). Run in the Supabase SQL editor after 0001/0002.
--
-- No CHECK constraint on `mode` on purpose: the mode registry lives in
-- app/domain/map_modes.py and unknown modes 404 at the API. A CHECK would force
-- a migration for every new map mode, which defeats the plug-in design.

create table if not exists map_layers (
    id                  uuid primary key default gen_random_uuid(),
    city_id             uuid not null references cities (id) on delete cascade,
    mode                text not null,
    feature_collection  jsonb not null,
    meta                jsonb not null default '{}'::jsonb,
    generated_at        timestamptz not null default now(),
    unique (city_id, mode)
);

create index if not exists map_layers_city_idx on map_layers (city_id);
