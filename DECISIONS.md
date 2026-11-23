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

## Phase 3: Pricing
11. **Every pricing is a fresh copy of the pricing sheet**, named "557 – Site – Pricing", then "rev 2", "rev 3". Old copies are kept, never deleted.
12. **Quote lines from a pricing** are one line per item (labour and materials together), plus "Travel and site costs" when there are any, plus "Minimum charge (half a day)" when a small job is lifted to the minimum. How these are worded on the quote document is decided when the quote is built.
13. **Pennies:** each line is rounded to the penny. If the lines come out a few pence different from the sheet's total, the largest line is adjusted so they add up to the sheet's price exactly. More than 5p out and the app refuses.
14. **The price list is read from the pricing template once a day**, with a button to refresh it straight away.
15. **Labour difficulty** is left at the sheet's default (Easy) for every line. Say if you want to choose it per line.
16. **In test mode the app won't save a pricing sheet into a real job folder.** Price a new test job instead, or go live.

## Phase 3: The quote document
17. **The cover reference is the plain number** (557), as the playbook says, and the acceptance line reads "you accept this quotation (557)".
18. **The schedule's Item / Ref / Works columns** are filled as: the item (e.g. "Double socket"), the quantity in Ref (e.g. "8"), and "Supply and fit 8 × double socket (Click, White Plastic)" in Works. You can change any of it before making the quote.
19. **The investment table has one line per priced line** (e.g. "Kitchen | 8 × Double socket | £544.29"), plus "Travel and site costs" with the miles. That itemises it for private clients, as the playbook asks.
20. **VAT is 20% of the subtotal, rounded to the penny,** and the total is the two added together. The app refuses a quote whose lines don't add up to the subtotal.
21. **The job name on the cover** starts as the first sentence of the job's description (if it's short), otherwise the site.
22. **The installation paragraph starts as a plain sentence** about BS 7671 and NAPIT certification. Please add the cable types, containment and finish for each job: the app won't invent them.
23. **No deposit:** when a client's notes say "no deposit", the payment table becomes "On completion 100%" and the deposit paragraph becomes "No deposit is needed. To go ahead, simply reply to this quotation or email info@battelectrical.com."
24. **Payment days:** the client's payment days replace "within 7 days of invoice". The late-payment wording ("5% after 7 days") is left exactly as the template has it.
25. **Revision on the cover stays "A".** A rebuilt quote is saved as "rev 2" in the file name. Say if you'd like the cover's revision letter to change too (B, C…).

## Still needed from Callum
- **Jed's email address** (the one his Google Calendar uses). Without it he can't be invited to visits. Add it in Settings, under People.
- **Round-trip miles** for each live job, on the job's Details tab, so travel is counted in profit.
