-- Phase 1: people, clients, jobs, visits and the bits that hang off a job.
-- The app talks to the database only from the server. Row-level security is switched on
-- with no policies, so Supabase's public API can read or write nothing.

create extension if not exists pgcrypto;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  short_name text not null unique,          -- how jobs refer to them: Cam, Callum, Jed
  full_name text not null,
  email text not null default '',
  role text not null default '',
  day_cost numeric(10,2) not null default 0, -- what a day on site costs Batt, for profit
  colour text not null default '#5A6470',
  active boolean not null default true,
  position int not null default 0
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null unique,
  type text not null default '',            -- Private, Commercial, Main contractor
  contact text not null default '',
  email text not null default '',
  phone text not null default '',
  billing_address text not null default '',
  payment_days int,                          -- null = use the quote's terms
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  create type job_stage as enum (
  'Enquiry', 'Draft quote', 'Quoted', 'Booked', 'In progress', 'Complete',
  'Invoiced', 'Paid', 'On hold', 'Lost', 'Closed'
);
exception when duplicate_object then null;
end $$;

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,                     -- the prototype's id, e.g. Q-556
  number int unique,                         -- 557; null until quoted
  legacy_ref text not null default '',       -- old style refs kept as they were: 23-001, H-004
  also int[] not null default '{}',          -- numbers merged into this job
  merged_into uuid references jobs(id),
  stage job_stage not null default 'Enquiry',
  client_id uuid references clients(id),
  site text not null default '',
  postcode text not null default '',
  type text not null default '',
  description text not null default '',
  contact text not null default '',
  miles_round_trip numeric(8,1),             -- exact road miles from 18 Alwin Close and back; null = not known
  quote_value numeric(12,2) not null default 0,
  received date,
  deadline date,
  quoted_at date,                            -- date the quote was sent
  outcome_at date,
  outcome_reason text not null default '',     -- why it was won or lost
  start_date date,
  end_date date,
  certs text not null default '',
  building_control text not null default '',
  drive_folder_id text not null default '',
  drive_folder_url text not null default '',
  links jsonb not null default '[]',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_stage_idx on jobs(stage);
create index if not exists jobs_client_idx on jobs(client_id);

create table if not exists job_people (
  job_id uuid not null references jobs(id) on delete cascade,
  person_id uuid not null references people(id),
  primary key (job_id, person_id)
);

create table if not exists quote_lines (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  kind text not null default 'other',
  description text not null default '',
  detail text not null default '',
  qty numeric(10,2) not null default 1,
  rate numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  position int not null default 0
);

create table if not exists variations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  description text not null default '',
  amount numeric(12,2) not null default 0,
  approved boolean not null default false,
  date date,
  created_at timestamptz not null default now()
);

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  job_id uuid references jobs(id) on delete set null,
  date date not null,
  start_time time,                           -- null = all day
  end_time time,
  work text not null default '',
  site text not null default '',
  confirmed boolean not null default true,
  calendar_event_id text not null default '',
  calendar_link text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visits_job_idx on visits(job_id);
create index if not exists visits_date_idx on visits(date);

create table if not exists visit_people (
  visit_id uuid not null references visits(id) on delete cascade,
  person_id uuid not null references people(id),
  primary key (visit_id, person_id)
);

do $$ begin
  create type cost_kind as enum ('Materials', 'Supplier invoice', 'Hire', 'Mileage', 'Subcontractor', 'Other');
exception when duplicate_object then null;
end $$;

create table if not exists costs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  kind cost_kind not null default 'Other',
  description text not null default '',
  amount numeric(12,2) not null default 0,   -- ex VAT; negative for a credit note
  date date,
  source_email_id text not null default '',
  file_url text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists costs_job_idx on costs(job_id);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  title text not null,
  due date,
  kind text not null default 'Custom',
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null default '',
  action text not null,
  entity text not null,
  entity_id text not null default '',
  detail jsonb not null default '{}'
);

alter table people enable row level security;
alter table clients enable row level security;
alter table jobs enable row level security;
alter table job_people enable row level security;
alter table quote_lines enable row level security;
alter table variations enable row level security;
alter table visits enable row level security;
alter table visit_people enable row level security;
alter table costs enable row level security;
alter table reminders enable row level security;
alter table settings enable row level security;
alter table audit_log enable row level security;

-- Defaults from the playbook and the overheads sheet. Day costs are full cost at 100% work rate.
insert into people (short_name, full_name, email, role, day_cost, colour, position) values
  ('Cam', 'Cameron Batt', 'cameron@battelectrical.com', 'Managing Director', 286, '#7C3AED', 1),
  ('Callum', 'Callum Blacknell', 'callum@battelectrical.com', 'Project Manager', 286, '#0F766E', 2),
  ('Jed', 'Jed Stansfield', '', 'Apprentice', 119, '#C2410C', 3)
on conflict (short_name) do nothing;

insert into settings (key, value) values
  ('margins', '{"green": 18, "red": 5}'),
  ('rates', '{"electricianDay": 441, "apprenticeDay": 184, "dayRate": 380, "apprenticeDayRate": 160, "surveyDay": 280, "perMile": 0.45, "markupPct": 15, "vatPct": 20}'),
  ('chase', '{"quoteDays": 7}')
on conflict (key) do nothing;
