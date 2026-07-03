-- 0004: vector search RPCs.
-- supabase-py cannot express `embedding <=> query` directly, so filtering + ranking
-- happen server-side and clients call these via .rpc().

create or replace function match_doc_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  filter_raion uuid default null,
  filter_category text default null
) returns table (
  id uuid,
  document_id uuid,
  raion_id uuid,
  category text,
  content text,
  similarity float
)
language sql stable as $$
  select
    c.id, c.document_id, c.raion_id, c.category, c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from doc_chunks c
  where c.embedding is not null
    and (filter_raion is null or c.raion_id = filter_raion)
    and (filter_category is null or c.category = filter_category)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_solution_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  filter_domain text default null,
  pop_min int default null,
  pop_max int default null
) returns table (
  id uuid,
  case_id uuid,
  city_id uuid,
  city_name text,
  country text,
  population int,
  content text,
  similarity float
)
language sql stable as $$
  select
    sc.id, sc.case_id, sc.city_id, ci.name as city_name, ci.country, ci.population, sc.content,
    1 - (sc.embedding <=> query_embedding) as similarity
  from solution_chunks sc
  join cities ci on ci.id = sc.city_id
  where sc.embedding is not null
    and (filter_domain is null or sc.problem_domain = filter_domain)
    and (pop_min is null or ci.population >= pop_min)
    and (pop_max is null or ci.population <= pop_max)
  order by sc.embedding <=> query_embedding
  limit match_count;
$$;

-- Coarse retrieval over per-raion digests, for vague questions ("tell me about Krosha").
create or replace function match_raion_digests(
  query_embedding vector(1536),
  match_count int default 3
) returns table (
  id uuid,
  raion_id uuid,
  content text,
  similarity float
)
language sql stable as $$
  select
    d.id, d.raion_id, d.content,
    1 - (d.embedding <=> query_embedding) as similarity
  from raion_digests d
  where d.is_current and d.embedding is not null
  order by d.embedding <=> query_embedding
  limit match_count;
$$;
