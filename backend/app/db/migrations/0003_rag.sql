-- 0003: agentic RAG — vector search over the solutions catalog and per-city documents.
-- Run in the Supabase SQL editor after 0001 (or 0002_reset_from_legacy).

create extension if not exists vector;

-- Solution chunks: one or more embedded fragments per catalog solution.
create table if not exists solution_chunks (
    id           uuid primary key default gen_random_uuid(),
    solution_id  uuid not null references solutions (id) on delete cascade,
    content      text not null,
    embedding    vector(1536) not null
);
create index if not exists solution_chunks_embedding_idx
    on solution_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists solution_chunks_solution_idx on solution_chunks (solution_id);

-- Per-city documents (generated profile + user-pasted reports), keyed by
-- normalized "city|country" so any city works without a cities row.
create table if not exists city_docs (
    id          uuid primary key default gen_random_uuid(),
    city_key    text not null,
    title       text not null,
    source_url  text,
    kind        text not null default 'pasted' check (kind in ('profile', 'pasted')),
    content     text not null,
    created_at  timestamptz not null default now()
);
create index if not exists city_docs_city_key_idx on city_docs (city_key);

create table if not exists city_doc_chunks (
    id        uuid primary key default gen_random_uuid(),
    doc_id    uuid not null references city_docs (id) on delete cascade,
    city_key  text not null,
    content   text not null,
    embedding vector(1536) not null
);
create index if not exists city_doc_chunks_embedding_idx
    on city_doc_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists city_doc_chunks_city_key_idx on city_doc_chunks (city_key);

-- supabase-py cannot express `<=>`, so similarity search lives in RPCs.

create or replace function match_solution_chunks(
    query_embedding vector(1536),
    match_count int default 6
)
returns table (
    chunk_id uuid,
    solution_id uuid,
    content text,
    similarity float,
    title text,
    city_name text,
    country text,
    source_urls text[]
)
language sql stable as $$
    select
        sc.id as chunk_id,
        sc.solution_id,
        sc.content,
        1 - (sc.embedding <=> query_embedding) as similarity,
        s.title,
        c.name as city_name,
        c.country,
        s.source_urls
    from solution_chunks sc
    join solutions s on s.id = sc.solution_id
    join cities c on c.id = s.city_id
    order by sc.embedding <=> query_embedding
    limit match_count;
$$;

create or replace function match_city_doc_chunks(
    query_embedding vector(1536),
    p_city_key text,
    match_count int default 6
)
returns table (
    chunk_id uuid,
    doc_id uuid,
    content text,
    similarity float,
    title text,
    kind text,
    source_url text
)
language sql stable as $$
    select
        cdc.id as chunk_id,
        cdc.doc_id,
        cdc.content,
        1 - (cdc.embedding <=> query_embedding) as similarity,
        cd.title,
        cd.kind,
        cd.source_url
    from city_doc_chunks cdc
    join city_docs cd on cd.id = cdc.doc_id
    where cdc.city_key = p_city_key
    order by cdc.embedding <=> query_embedding
    limit match_count;
$$;
