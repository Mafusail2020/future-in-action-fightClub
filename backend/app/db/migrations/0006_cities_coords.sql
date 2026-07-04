-- 0006: cities on the world map — coordinates + stable slug for the frontend.

alter table cities add column if not exists lat double precision;
alter table cities add column if not exists lng double precision;
alter table cities add column if not exists slug text;

create unique index if not exists cities_slug_idx on cities (slug) where slug is not null;
