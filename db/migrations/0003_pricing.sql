-- Phase 3: pricing with the pricing spreadsheet.

-- What was asked for and what the sheet answered, for the latest pricing of a job.
alter table jobs add column pricing jsonb;

-- Every document the app makes for a job: pricing sheets now, quotes, RAMS and invoices later.
create table documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  kind text not null,                 -- pricing, quote, rams, invoice, other
  revision int not null default 1,
  name text not null default '',
  doc_id text not null default '',    -- the Google file
  url text not null default '',
  pdf_file_id text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index documents_job_idx on documents(job_id);
alter table documents enable row level security;

-- Batt's own templates. Documents are always made by copying these, never from scratch.
insert into settings (key, value) values ('templates', '{
  "pricing": "11Od3EnGYK4KM-iaVXFTBznJTD0V89fEdxyFgr6vsUSI",
  "quoteShort": "1eWmy-Ab51d7VcdUClgJRhowyzS90Hx4FfxV2U_becD8",
  "quoteLong": "1mCfNuhuLJXb1OhAdEELFlWB3kwfiq8mCDZc1tkf2kb8",
  "surveyProposal": "14VcaGymehsfOd1yoaJupJufpM_auPwsk4Rqna3AF-VU",
  "rams": "14vFKOZuTRZdrjBpr4R3l6lo4bKq-N8w_FP5wENKukcg",
  "invoice": "1l1o1aNU82-m6T75Yx5vnUm2EAfuROpz9zM21zXBULr0"
}');
