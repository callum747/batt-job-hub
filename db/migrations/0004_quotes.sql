-- Phase 3: the quote document. The last quote's content is kept so it can be changed and rebuilt.
alter table jobs add column if not exists quote_draft jsonb;
alter table documents add column if not exists pdf_url text not null default '';
alter table documents add column if not exists pages int;
alter table documents add column if not exists note text not null default '';
