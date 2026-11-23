-- Callum asked (23/11/2026) for the Ace Pro water-heater survey enquiry to be removed, keeping the real job (#555).
-- Guarded: only that one enquiry, and only while it's still an un-numbered enquiry with no visits or costs.
with gone as (
  delete from jobs j
  where j.legacy_id = 'phq10mh16jfprdowmm87' and j.number is null and j.stage = 'Enquiry'
    and not exists (select 1 from visits v where v.job_id = j.id)
    and not exists (select 1 from costs c where c.job_id = j.id)
  returning j.id, j.site
)
insert into audit_log (actor, action, entity, entity_id, detail)
select 'callum (by request)', 'deleted', 'job', id::text, jsonb_build_object('site', site, 'why', 'Survey enquiry removed at Callum''s request; job #555 kept') from gone;
