-- Phase 3: the quote document. The last quote's content is kept so it can be changed and rebuilt.
alter table jobs add column quote_draft jsonb;
alter table documents add column pdf_url text not null default '';
alter table documents add column pages int;
alter table documents add column note text not null default '';
