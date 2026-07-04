-- City Solutions Aggregator — core schema.
-- Run in the Supabase SQL editor. Plain Postgres; no pgvector (matching is LLM-over-catalog).

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
