-- Messages sent to the assistant while it is still working. It picks them up between steps of the task in hand.
create table if not exists assistant_queue (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references assistant_chats(id) on delete cascade,
  email text not null,
  text text not null,
  created_at timestamptz not null default now(),
  taken_at timestamptz
);
create index if not exists assistant_queue_waiting_idx on assistant_queue(chat_id) where taken_at is null;
alter table assistant_queue enable row level security;
