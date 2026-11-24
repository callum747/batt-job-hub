-- Vans and other vehicles: who drives it, what's due when, and its folder in Drive.
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- what you call it: "Callum's Transporter"
  registration text not null default '',
  make_model text not null default '',
  driver_id uuid references people(id),
  mot_due date,
  tax_due date,
  insurance_due date,
  service_due date,
  mpg numeric(5,1),                         -- what it really does to the gallon
  finance text not null default '',         -- lease or finance: who with, payment, end date
  notes text not null default '',
  drive_folder_id text not null default '',
  drive_folder_url text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table vehicles enable row level security;

-- The Drive folder the vehicles' own folders sit in: 06 - Vehicles & Equipment › 01 - Vehicles.
insert into settings (key, value) values ('vehicles', '{"folderId": "1_CqLmnkqWZFC4EN_2yDAV8pCPP4XAc7c", "folderUrl": "https://drive.google.com/drive/folders/1_CqLmnkqWZFC4EN_2yDAV8pCPP4XAc7c"}')
on conflict (key) do nothing;
