-- The assistant: each conversation, kept so it can be picked up again on any device.
-- messages holds the conversation exactly as the model needs it back, so it can carry on.
create table if not exists assistant_chats (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  title text not null default '',
  job_id uuid references jobs(id) on delete set null,
  messages jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_chats_email_idx on assistant_chats(email, updated_at desc);
alter table assistant_chats enable row level security;
