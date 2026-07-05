-- 0002: One-shot reset from the pre-pivot ("Zhytomyr adviser") schema to the
-- aggregator schema. The old `cities` table has different columns, so 0001's
-- `create table if not exists` silently keeps the wrong shape — this file
-- drops every legacy table and recreates the aggregator schema cleanly.
--
-- Run in the Supabase SQL editor INSTEAD of 0001 when the project previously
-- held the pre-pivot schema. Safe to re-run. DESTROYS all pre-pivot data.

-- Legacy vector-search functions (referenced legacy tables).
drop function if exists match_doc_chunks(vector, int, uuid, text);
drop function if exists match_solution_chunks(vector, int, text, int, int);
drop function if exists match_raion_digests(vector, int);

-- Legacy tables, dependents first.
drop table if exists solution_chunks cascade;
drop table if exists solution_cases cascade;
drop table if exists doc_chunks cascade;
drop table if exists map_features cascade;
drop table if exists raion_metrics cascade;
drop table if exists raion_digests cascade;
drop table if exists documents cascade;
drop table if exists sources cascade;
drop table if exists raions cascade;
drop table if exists profiles cascade;
drop table if exists solutions cascade;
drop table if exists cities cascade;

-- ---------------------------------------------------------------------------
-- Aggregator schema (identical to 0001_schema.sql — keep the two in sync).
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- Cities that either implemented a solution or are the user's home city.
create table if not exists cities (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    country     text not null,
    region      text,
    lat         double precision not null,
    lng         double precision not null,
    population  integer,
    area_km2    double precision,
    climate     text,
    created_at  timestamptz not null default now()
);

-- One city per (name, country), case-insensitive — lets the loader upsert idempotently.
create unique index if not exists cities_name_country_key
    on cities (lower(name), lower(country));

-- A concrete initiative a city implemented, categorized by domain.
create table if not exists solutions (
    id           uuid primary key default gen_random_uuid(),
    city_id      uuid not null references cities (id) on delete cascade,
    category     text not null check (category in (
        'transport','energy','housing','water','waste','safety',
        'health','environment','digital','governance','economy','climate_resilience'
    )),
    title        text not null,
    problem      text not null,
    solution     text not null,
    outcome      text,
    cost         text,
    year_start   integer,
    year_end     integer,
    source_urls  text[] not null default '{}',
    tags         text[] not null default '{}',
    created_at   timestamptz not null default now(),
    -- Idempotent re-seeding: same city + title should not duplicate.
    unique (city_id, title)
);

create index if not exists solutions_category_idx on solutions (category);
create index if not exists solutions_city_id_idx on solutions (city_id);

-- Optional cache of generated city profiles (keyed by normalized "city|country").
create table if not exists profiles (
    key         text primary key,
    profile     jsonb not null,
    created_at  timestamptz not null default now()
);
