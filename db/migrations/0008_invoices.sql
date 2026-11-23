-- Batt's own invoices. The ledger spreadsheet (00 - Batt Job Hub, Invoices tab) stays the record GPG uses;
-- this table remembers what the app made, so numbers never clash or skip.
-- status: started (number reserved, being made), failed (not made: its number is used by the next invoice), made, sent, paid.
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete set null,
  test boolean not null default false,       -- made in test mode: TEST-INV-#, test folder and test ledger only
  number int not null,
  type text not null,
  stage_label text not null default '',
  vat_treatment text not null default 'Standard 20%',
  cis boolean not null default false,
  invoice_date date not null,
  supply_date date not null,
  terms_days int not null,
  due_date date not null,
  client_name text not null default '',
  client_email text not null default '',
  billing_address text not null default '',
  site text not null default '',
  lines jsonb not null default '[]',
  net numeric(12,2) not null default 0,
  vat numeric(12,2) not null default 0,
  gross numeric(12,2) not null default 0,
  cis_labour numeric(12,2),
  cis_deduction numeric(12,2),
  payable numeric(12,2) not null default 0,
  doc_id text not null default '',
  doc_url text not null default '',
  pdf_file_id text not null default '',
  pdf_url text not null default '',
  ledger_row int,
  ledger_error text not null default '',
  status text not null default 'started',
  note text not null default '',
  sent_date date,
  paid_date date,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  unique (test, number)
);
create index if not exists invoices_job_idx on invoices(job_id);
alter table invoices enable row level security;

-- Where invoices go. Test mode uses a folder and a copy of the ledger inside "ZZ – Job Hub TEST".
insert into settings (key, value) values ('finance', '{
  "ledgerId": "1IFRTQz-rsTclYKGRVZxC0CjVO1769ByCXLc9msEaJBY",
  "invoicingFolder": "1M7EMynAWErpUv-FL7Zp1JIzJGgY48D7B",
  "test": { "folder": null, "ledgerId": null }
}') on conflict (key) do nothing;

-- Meterz pays on 30-day terms (confirmed by Callum, 23/11/2026).
update clients set payment_days = 30 where name = 'Meterz' and payment_days is null;
