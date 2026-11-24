-- The training matrix: each person's qualifications and cards, with when they run out.
create table if not exists qualifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  name text not null,                        -- "ECS Gold Card", "18th Edition (BS 7671)", "C&G 2391", "IPAF"
  number text not null default '',           -- card or certificate number
  issued date,
  expires date,                              -- null = doesn't expire
  file_url text not null default '',         -- link to the certificate or card in Drive
  notes text not null default '',
  active boolean not null default true,      -- false = no longer held; kept for the record
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qualifications_person_idx on qualifications(person_id);
alter table qualifications enable row level security;

-- Callum's qualifications as he gave them (no dates were given, so none are filled in). Added once.
insert into qualifications (person_id, name)
select p.id, q.name
from people p cross join (values ('Level 3 Electrotechnical NVQ'), ('AM2'), ('C&G 2391 Inspection and Testing')) as q(name)
where p.short_name = 'Callum' and not exists (select 1 from qualifications);
