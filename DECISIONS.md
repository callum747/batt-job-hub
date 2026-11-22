# Decisions Claude made, for Callum to check

Things that weren't spelled out in the brief or the playbook. Say if any should change.

## Phase 2: Drive and Calendar
1. **The app acts in Google as whoever is signed in.** A folder Callum's click creates is created by Callum in Drive, and a visit Cam books is put in the calendar by Cam.
2. **Permissions asked for:** full Google Drive and full Google Calendar. Drive needs to be full so the app can move and list existing job folders and, later, fill in the Docs and Sheets templates. Calendar needs to be full so the app can make the test calendar.
3. **Calendar invites:** people are invited to visits, but Google only emails them if they don't use Google Calendar (the same setting the old app used). The visit still appears in their calendar.
4. **Pencilled-in visits** are titled "Pencilled in: ..." in the calendar.
5. **A timed visit with no finish time** shows as one hour in the calendar.
6. **Dragging a visit in the planner** swaps the person whose row it came from for the person whose row it lands on. Anyone else on the visit stays on it.
7. **Folders for jobs on hold:** an on-hold job's folder stays where it is. If it has no folder yet, it's made in Live.
8. **Renaming:** if a job's client or site is changed later, its Drive folder keeps its original name. Say if you'd like the app to rename it.
9. **Jobs numbered while in test mode** get their folder in the test area. After going live, those folders stay in the test area; move them by hand or ask Claude to.
10. **Removing a visit** asks you to confirm, then removes it from the calendar too.

## Still needed from Callum
- **Jed's email address** (the one his Google Calendar uses). Without it he can't be invited to visits. Add it in Settings, under People.
- **Round-trip miles** for each live job, on the job's Details tab, so travel is counted in profit.
