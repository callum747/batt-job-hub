-- The latest count of a job's drawings: what was read, the points found room by room, and anything to check.
alter table jobs add column if not exists drawing_count jsonb;
