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

## Phase 3: Survey proposals
26. **A job is a survey when its type is "Survey".** It gets the survey form instead of the pricing spreadsheet.
27. **Survey rates come from Settings, never from the browser:** £280 a day, 45p a mile, weekends 1.5 times.
28. **Mileage wording:** one site reads "304 miles round trip (152 miles each way) from our Aylesbury registered office, at 45p per mile". Several sites read "165 miles round trip (Aylesbury to X, Y and Z and back) from our Aylesbury registered office…", with no per-site times.
29. **No travel:** if the miles are 0, the Mileage row is taken out of the proposal.
30. **Site rows** read "SITE NAME, ADDRESS, POSTCODE" in capitals, as the playbook asks. A unit with no area says "tbc".

## Phase 3: Long form
31. **Investment is grouped by price list section** (Power and data, Lighting, Switching and controls, Fire detection, Ventilation, Distribution and other works), with travel and site costs as Preliminaries.
32. **Per-point rates only for items priced on the job.** A rate with nothing priced behind it (e.g. data points on a job with none) is taken out rather than guessed.
33. **The appendix point schedule is filled from the pricing,** room by room, or taken out when nothing was priced by room. The template's floor headings are removed; rooms are listed in the order priced.
34. **The lighting key lists the priced light fittings.**
35. **Payment days:** the client's, otherwise 30 for main contractors and 7 for everyone else. **Payment stages stay 25 / 35 / 30 / 10** as the template has them.

## Ask (the chat assistant)
36. **It uses Claude Opus 5.5** at high effort, the strongest model that's sensible for day-to-day use. If a request is ever declined by the model's safety checks, it's automatically retried on Anthropic's default backup model rather than just failing.
37. **It can't send anything, delete anything, or set a price.** There's no tool for those. Prices only come from the pricing spreadsheet; it can price a job and make a quote, which are drafts in the job folder.
38. **Stage changes only when asked** ("mark 559 as quoted").
39. **It checks the item list with you before pricing** if it assumed anything; with a clear, complete list it goes straight ahead.
40. **Each person sees only their own chats.** Chats are kept so they can be picked up later.
41. **Clients moved off the phone's bottom bar** to make room for Ask. It's under More.
42. **Built on Anthropic's standard API, run by the app itself** (not Anthropic's hosted "Managed Agents"), because everything the assistant does is the app's own database and Google work, which has to run inside the app.

## Email
43. **Drafts only, in the sender's own Gmail.** The app asks Google for permission to read email and to compose drafts; it has no way to send.
44. **The covering email is a fixed, plain wording** (thanks, what's attached, the total ex and inc VAT, how to go ahead, phone number, your name and title). It's not written by AI, so it's the same every time and you edit it before saving.
45. **A job's emails are found by the job number in the subject, or the client's email address**, over the last two years, in every mailbox that's connected (yours and Cam's). You only get links to threads in your own mailbox.

46. **The Inbox shows your own inbox only**, last 30 days, from outside battelectrical.com. Cam sees his and you see yours. If info@ is its own Google account, someone can sign in as info@ and connect it, and its inbox works the same way.
47. **An email is "on a job" when** it's linked from the Inbox, or its subject has an existing job number in it. Those don't show in the Inbox.
48. **Making a job from an email uses a quick, low-effort read** by the assistant (it's filling a form you check, not pricing).

49. **Supplier invoices are read from info@** (where CEF sends them). Its permission is given by signing in to the app as info@ once.
50. **Automatic filing needs all of:** an invoice or credit note, made out to Batt, net + VAT = total (to 2p), exactly one existing job number. Otherwise a person decides. A quote is never treated as an invoice.
51. **The cost is the net amount (before VAT)**, as costs are everywhere else in the app. Credit notes are minus amounts.
52. **The check runs while someone has the app open**, at most every 30 minutes (Replit's always-on hosting doesn't run timers on its own). Up to 15 new emails per check; the last 45 days are looked at.
53. **The PDF isn't copied into the job's Drive folder yet.** The cost links back to the email. Say if you'd like the PDF filed in the job's 04 - Procurement folder too.

## Invoices
54. **Stage invoices follow the payment table on the job's own quote** (your answer, 23/11/2026): short form 20% deposit then 80% on completion (100% on completion for no-deposit clients); long form 25 / 35 / 30 / 10; survey 100% on completion. The last stage is "whatever's left": the quote plus approved extras, less everything already invoiced.
55. **Meterz is on 30 days** (your answer). Terms default to the client's payment days, then the quote's, then 7.
56. **The ledger spreadsheet stays the record** (your answer). The app writes only its input columns (A–J, M for CIS, P, AA, AB) in the first empty row, and fills Sent Date (R) and Paid Date (S) when you mark an invoice sent or paid.
57. **Numbers never clash or skip:** the next number is one more than the highest in the ledger's column A, its "next number" cell, or the app. If an invoice fails part way, its number is kept and used by the next one.
58. **Quote reference on the invoice and in the ledger is the plain job number** (559), as everywhere else in the app. Older jobs keep their old reference (Q-549).
59. **VAT or CIS is never guessed.** For a main contractor the form won't make the invoice until you choose. CIS invoices are reverse charge (no VAT added), with 20% of the labour deducted.
60. **CIS labour is suggested, not decided:** the pricing sheet's labour, in proportion to how much of the quote this invoice is. You check it against the sheet and change it if needed.
61. **Test mode is kept completely apart:** TEST-INV-1, TEST-INV-2… in "ZZ – Job Hub TEST › Invoices (TEST)", rows in a copy of the ledger there, and test invoices never change a job's money.
62. **A job's profit uses invoiced income only once it's fully invoiced** (stage Invoiced, Paid or Closed, or invoices reaching the quote plus extras). Before that the quote is used, so a deposit doesn't make a job look like a loss.
63. **The invoice email is a new email, not a reply in the quote thread,** and ends "Kind Regards," with your name and title written in (the app can't add your Gmail signature). Say if you'd like it threaded.
64. **Final, survey and day-rate invoices move the job to Invoiced;** when the last of them is paid the job moves to Paid and its folder to Completed.
65. **Not built yet:** credit notes, chasing overdue invoices, CIS statements, bank statements and the quarter-end pack. Those come next.

66. **Fuel and travel in a job's profit is worked out as the quote did** (your request, 23/11/2026): the quote's round-trip miles × the quote's vans × 45p gives the cost per day, times the number of days someone has actually been on site. A job that hasn't been priced uses its own miles box and one van.

67. **The Invoices page reads the ledger, not just the app,** so hand-raised invoices are included. In test mode it reads the test copy.
68. **Chasers are new emails, not replies in the invoice thread,** with the invoice attached when the ledger links its PDF. Reminder 1 until a week overdue, reminder 2 for the second week, reminder 3 from then on (finance rules).
69. **A payment is only marked paid when the amount received equals the amount payable** (to the penny). Anything else is left for a person.
70. **CIS Received rows aren't filled yet** when a CIS invoice is paid. That's part of the CIS work coming next.

71. **A Drive folder becomes a job only if its name starts with a job number** (3 or 4 digits, optionally "Q-"), e.g. "560 – Client – Site". Anything else (templates, archives) is ignored.
72. **The stage for a folder found in Drive comes from where it sits:** Live = Draft quote, Active = Booked, Completed = Paid, Lost = Lost. Change it on the job if it's wrong.
73. **The app doesn't add the eight subfolders to a folder you made by hand** (it might already have its own). Quotes and invoices go in its "01…" subfolder if there is one, otherwise in the folder itself.
74. **An enquiry made in the app still gets its folder when it's numbered** (priced, or moved past Enquiry), because the folder name needs the number. Say if you'd like every new job numbered and given a folder straight away.

75. **A contractor's statement is "missing" once its Statement Due date has passed** (the ledger works that out: the 19th after the tax month). The request is a new email to the address on the CIS Received row.
76. **A statement is filed in the VAT quarter of its tax month,** in 03 - CIS Statements Received, named "CIS Statement – Contractor – Tax month ending 5 Mon YYYY".
77. **Subcontractor payments use the name, UTR, verification number and rate on the ledger's Subcontractors tab.** "[TBC]" counts as not known.

78. **Job numbers are written with a #** everywhere the app writes them (your request, 23/11/2026). Old refs like 23-001 and H-001 aren't job numbers and stay as they are.
79. **Drive is followed, not overruled:** a folder moved by hand sets the job's stage to Live = Draft quote, Active = Booked, Completed = Paid, Lost = Lost, unless the job's stage already belongs in that folder (so Invoiced in Active stays Invoiced). A rename changes the client or site only when that part of the name changes.
80. **A folder named only "2000"–"2099" is a year folder,** not a job.
81. **Existing Drive names were changed from "Q-552" to "#552"** (folders and file names only, never what's inside a file), and the ledger's Quote Ref from Q-549 to #549 (your answer, 23/11/2026).

82. **A survey's quoted miles cover the whole trip,** so they're counted once (as soon as a survey day has been done), not once per day: #548's 623 miles across four days is 623 miles, as the proposal charged.

## Design
83. **The app is always light** (your request): dark mode on the device is ignored.
84. **Brand guide followed:** only Batt Blue, Black, Steel, Light Grey and White for the interface (plus green, amber and red for money lights and status); Saira Expanded Bold capitals for headlines and figures; Inter elsewhere; the blue bar as the heading marker; text on blue is black.
85. **People's default colours moved to brand colours** (Cam black, Callum Batt Blue, Jed steel). A colour picked by hand in Settings is kept.
86. **Phone tiles use shorter labels:** "Spent", "Profit", "Unpaid invoices".

## Still needed from Callum
- **Jed's email address** (the one his Google Calendar uses). Without it he can't be invited to visits. Add it in Settings, under People.
- **For Jed's monthly CIS statement:** his full legal name, email and address (on the ledger's Subcontractors tab), and Batt's CIS employer's reference (GPG have it).
- **An Anthropic API key** for the Ask screen, added in Replit Secrets as `ANTHROPIC_API_KEY`.
- **Round-trip miles** for each live job, on the job's Details tab, so travel is counted in profit.
