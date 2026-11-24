-- A log for each vehicle: every MOT, service, insurance renewal, repair, with the paperwork.
create table if not exists vehicle_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  kind text not null,                        -- MOT, Service, Insurance, Road tax, Repair, Tyres, Other
  date date not null,
  mileage int,
  cost numeric(12,2),                        -- ex VAT
  notes text not null default '',
  file_url text not null default '',
  file_name text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists vehicle_events_vehicle_idx on vehicle_events(vehicle_id, date desc);
alter table vehicle_events enable row level security;

-- Where each person's cards and certificates are kept: 08 - Staff & Employees › 02 - Qualifications & Cards.
insert into settings (key, value) values ('training', '{"folderId": "1kClfBOidk3lTwFVXY_n13vej05N7Q79P", "folderUrl": "https://drive.google.com/drive/folders/1kClfBOidk3lTwFVXY_n13vej05N7Q79P"}')
on conflict (key) do nothing;
alter table people add column if not exists training_folder_id text not null default '';
alter table people add column if not exists training_folder_url text not null default '';
