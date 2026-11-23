-- Three jobs that were filed in the old archive in Drive but are still live (Callum, 23/11/2026): #506, #526, #531.
-- Each is added only if no job has that number. One that's already here as Lost or Closed is brought back to Quoted.
-- Nothing in Drive is moved or changed: #526 and #531 are linked to their folders where they sit.
insert into jobs (number, stage, site, contact, drive_folder_id, drive_folder_url, drive_folder_name, notes)
select v.number, 'Quoted', v.site, v.contact, v.folder, case when v.folder = '' then '' else 'https://drive.google.com/drive/folders/' || v.folder end, v.folder_name,
       '23/11/2026: added back as a live job. It was filed in the old archive in Drive (' || v.wherefrom || ') but is still live. Check the stage, client and quote value.'
from (values
  (506, '55 Willis Road', '', '', '', 'quote files "55 Willis Road, Q-506", no folder of its own'),
  (526, '19 Back Street', 'Caswell', '1IZPG1ZBkqpqVN_T7dNm8Kn9sBFY1h8RU', '19 Back Street - Caswell - Q-526', 'folder "19 Back Street - Caswell - Q-526" in July 26'),
  (531, '90 Wycombe Road', '', '1X2EtBZRE4bOOQRD_3mmGTjN1jtIoXdDS', '90 Wycombe Road - Q-531', 'folder "90 Wycombe Road - Q-531" in August 26')
) as v(number, site, contact, folder, folder_name, wherefrom)
where not exists (select 1 from jobs j where j.number = v.number or v.number = any(j.also));

update jobs set stage = 'Quoted', updated_at = now(),
  notes = case when notes = '' then '' else notes || E'\n' end || '23/11/2026: brought back to Quoted. It was archived but is still live.'
where number in (506, 526, 531) and stage in ('Lost', 'Closed') and merged_into is null and notes not like '%archived but is still live%';
