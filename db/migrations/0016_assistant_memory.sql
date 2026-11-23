-- Lasting things Callum and Cam tell the assistant ("from now on...", a client's new terms). Shared by everyone,
-- read at the start of every chat. Nothing is deleted: a note that no longer holds is switched off.
create table if not exists assistant_memory (
  id uuid primary key default gen_random_uuid(),
  note text not null,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  active boolean not null default true,
  ended_by text not null default '',
  ended_at timestamptz
);
alter table assistant_memory enable row level security;
