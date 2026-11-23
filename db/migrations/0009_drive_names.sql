-- The job folder's name as last seen in Drive, so a rename by hand can update the job's client and site.
alter table jobs add column if not exists drive_folder_name text not null default '';
-- And which stage folder it was last seen in, so only a move made after that changes the job's stage.
alter table jobs add column if not exists drive_folder_area text not null default '';
