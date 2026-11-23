-- Supplier invoices read from the invoices mailbox (info@). Each PDF is read once.
-- status: 'filed' (put on a job as a cost), 'check' (waiting for a person), 'ignored' (not a job cost, or not an invoice).
create table if not exists supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  mailbox text not null,
  message_id text not null,
  attachment text not null default '',
  email_subject text not null default '',
  email_from text not null default '',
  received date,
  supplier text not null default '',
  invoice_number text not null default '',
  invoice_date date,
  credit_note boolean not null default false,
  net numeric(12,2),
  vat numeric(12,2),
  gross numeric(12,2),
  order_reference text not null default '',
  job_numbers int[] not null default '{}',
  job_id uuid references jobs(id) on delete set null,
  cost_id uuid references costs(id) on delete set null,
  status text not null default 'check',
  reason text not null default '',
  decided_by text not null default '',
  filed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (mailbox, message_id, attachment)
);
create index if not exists supplier_invoices_status_idx on supplier_invoices(status, created_at desc);
alter table supplier_invoices enable row level security;
alter table supplier_invoices add column if not exists filed_at timestamptz;

insert into settings (key, value) values ('invoices', '{"mailbox": "info@battelectrical.com", "lastScan": null}')
on conflict (key) do nothing;
