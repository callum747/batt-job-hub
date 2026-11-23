-- Things the assistant has been asked to bin in Drive but that wait for the person to say yes in their next message.
create table if not exists assistant_pending (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  action text not null,
  item_id text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists assistant_pending_idx on assistant_pending(email, item_id) where done_at is null;
alter table assistant_pending enable row level security;
