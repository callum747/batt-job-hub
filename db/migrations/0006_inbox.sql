-- The inbox: emails linked to a job (so they show on its Email tab whatever their subject),
-- and emails someone has said aren't a job, so they stop showing in the inbox.
create table if not exists job_threads (
  mailbox text not null,
  thread_id text not null,
  job_id uuid not null references jobs(id) on delete cascade,
  linked_by text not null default '',
  linked_at timestamptz not null default now(),
  primary key (mailbox, thread_id)
);
create index if not exists job_threads_job_idx on job_threads(job_id);
alter table job_threads enable row level security;

create table if not exists inbox_hidden (
  mailbox text not null,
  thread_id text not null,
  hidden_by text not null default '',
  hidden_at timestamptz not null default now(),
  primary key (mailbox, thread_id)
);
alter table inbox_hidden enable row level security;
