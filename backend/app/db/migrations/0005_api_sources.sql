-- 0005: API scraper support.
--  * new source kind 'api' (SaveEcoBot, city budget via data.gov.ua, Prozorro)
--  * city-wide metrics: raion_id becomes nullable (NULL = whole city, same
--    convention documents already use)
--  * documents.external_id: stable per-origin id so re-running a scraper
--    replaces its documents instead of duplicating them
--  * map_features.document_id cascades on delete so document replacement works

alter table sources drop constraint if exists sources_kind_check;
alter table sources add constraint sources_kind_check
  check (kind in ('camera','official_doc','public_doc','news','osm','manual','api'));

alter table raion_metrics alter column raion_id drop not null;

alter table documents add column if not exists external_id text;
create unique index if not exists documents_source_external_idx
  on documents (source_id, external_id) where external_id is not null;

alter table map_features drop constraint if exists map_features_document_id_fkey;
alter table map_features add constraint map_features_document_id_fkey
  foreign key (document_id) references documents(id) on delete cascade;
