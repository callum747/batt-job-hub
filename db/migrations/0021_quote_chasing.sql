-- Chasing quotes: when a quote was last chased and how many times, so the next chase can be worked out.
alter table jobs add column if not exists quote_chased_at date;
alter table jobs add column if not exists quote_chases int not null default 0;
-- A job already at Quoted with no sent date can't be chased on time. Use the day it was last touched, once.
update jobs set quoted_at = updated_at::date where stage = 'Quoted' and quoted_at is null;
