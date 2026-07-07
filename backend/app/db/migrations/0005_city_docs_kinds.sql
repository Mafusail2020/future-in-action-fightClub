-- Deep dossier ingests several document kinds into city_docs — 'dossier' (the
-- synthesized sections), 'web' (live web-research findings) and 'opendata'
-- (Wikidata / OSM facts) — on top of the original 'profile' and 'pasted'.
-- Relax the kind CHECK so search_city_state can index and cite all of them, and
-- so new kinds don't require another migration.
--
-- Apply this in the Supabase SQL editor (existing projects). Fresh projects pick
-- it up in migration order after 0003_rag.sql.

alter table city_docs drop constraint if exists city_docs_kind_check;
