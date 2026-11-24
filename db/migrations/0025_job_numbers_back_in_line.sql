-- Job numbers jumped into the 2000s (#2030, #2031) because a year folder in Drive ("2026") was once read as a
-- job, and new numbers carried on from it. This puts them back in line, once.

-- 1. Things that were never jobs: a year folder taken for a job. Only removed if nothing hangs off them.
delete from jobs j
where j.number between 2000 and 2099
  and j.drive_folder_name ~ '^20[0-9]{2}$'
  and j.quote_value = 0
  and not exists (select 1 from visits v where v.job_id = j.id)
  and not exists (select 1 from invoices i where i.job_id = j.id)
  and not exists (select 1 from documents d where d.job_id = j.id)
  and not exists (select 1 from costs c where c.job_id = j.id);

-- 2. Real jobs that were given a number in the 2000s: the next proper numbers, oldest first. The old number is
--    kept on the job (in "also" and in its notes), so "#2031" still finds it and a wholesaler invoice quoting it still matches.
with wrong as (
  select id, number, row_number() over (order by number) as rn from jobs where number between 2000 and 2099 and merged_into is null
), top as (
  select coalesce(max(n), 0) as m from (
    select number as n from jobs where number is not null and number < 2000
    union all select unnest(also) from jobs
  ) x where n < 2000
)
update jobs j
set number = top.m + wrong.rn,
    also = array_append(j.also, wrong.number),
    notes = case when j.notes = '' then '' else j.notes || E'\n' end
      || to_char(now() at time zone 'Europe/London', 'DD/MM/YYYY') || ': job number corrected from #' || wrong.number || ' to #' || (top.m + wrong.rn) || ' (the numbering had jumped by mistake).',
    updated_at = now()
from wrong, top
where j.id = wrong.id;
