# What's changed

Plain-English notes on what's new in the Batt Job Hub, newest first.

## 23/11/2026: Survey proposals
- **Survey jobs** (job type "Survey") get a survey form on the Quote & money tab instead of the pricing spreadsheet.
- **Fill in the sites and units:** each site's name, address and postcode, then each unit with its area in sq ft (left empty it shows "tbc") and what's being surveyed.
- **Price it:** survey days, the exact round-trip miles and, for a trip covering several sites, the route. A weekend box charges 1.5 times. The price shows as you type.
- **Press "Price it and make the survey proposal".** The app prices it from the rates in Settings (£280 a survey day, 45p a mile), gives the job its number and folder if it hasn't got them, and makes the survey proposal from your template with a PDF beside it.
- Checked against Batt's past survey quotes: Q-546 £416.80, Q-547 £634.25, Q-548 £1,400.35 and Q-549 £506.80 all come out to the penny.
- Tested on a real copy of the survey template with three sites and seven units: four pages, no placeholders left.

## 23/11/2026: The quote document (short form)
- **Make the quote** from a priced job, on its Quote & money tab. The app fills in a first draft from the pricing: the cover, a room-by-room schedule (one area per room you priced), the investment lines, totals and VAT, your name, title and email, today's date and valid for 30 days.
- **Check and change the wording** before it's made: the job name on the cover, the project summary, the installation description, every schedule line (add or remove rooms and lines), exclusions and assumptions, the deposit and the payment days.
- **The money can't be typed in.** It always comes from the pricing sheet; price it again to change it.
- **Client terms are followed:** a client whose notes say "no deposit" gets 100% on completion, and the client's payment days replace "7 days".
- **What it makes:** a copy of your short-form template in the job's 01 - Quote & Contract folder, filled in, and a PDF beside it. A second quote is "rev 2"; nothing is overwritten.
- **It checks its own work:** if anything in square brackets is left, or the PDF is too short, it stops and says so, and no PDF is saved.
- Tested on a real copy of your template with four rooms (one more than the template has): four pages, nothing cut off, no placeholders left.
- Jobs of £2,000 or more still get the short form for now, with a note. The long form and the survey proposal are next.

## 22/11/2026: Pricing (first half of Phase 3)
- **Price a job** on its Quote & money tab. Pick items from your price list (start typing "double socket"), give the area and quantity, and add the round-trip miles, people on site, vans and any parking, waste or hire costs.
- **Items not on the price list** can be added with their material cost and labour hours each. The app never guesses these.
- **The pricing spreadsheet does the sums.** Each pricing copies your pricing template into the job's 01 - Quote & Contract folder, writes the items in, and reads back the price, VAT, profit and margin. A second pricing makes a new copy ("rev 2"); nothing is overwritten.
- **The result** shows on the job: ex VAT, inc VAT, margin against the sheet's 18% target with a green, amber or red light, each line's amount, and a link to the sheet.
- **Pricing an enquiry gives it its job number** and makes its Drive folder.
- If the sheet can't price a line, or the lines don't add up to the sheet's total, the app says so and saves nothing.
- Checked against your real sheet: 8 x "Double socket | Click | White Plastic" comes to £544.29.

## 22/11/2026: Drive folders and the diary (Phase 2)
- **Connect Google**: a bar at the top asks each of you, once, to let the app use your Google Drive and Calendar.
- **Job folders**: when a job gets its number, the app makes its Drive folder (`557 – Client – Site`) with the eight standard subfolders. When the stage changes, the folder moves between Live, Active, Completed and Lost. If Google has a problem, the job shows what went wrong with a Try again button.
- **Files tab**: each job lists what's in its Drive folder, subfolder by subfolder, with links.
- **Diary**: a week planner with a row per person. Book a visit, click one to change it, or drag it to another person or day. On a phone it's a day-by-day list.
- **Calendar**: every visit goes into Google Calendar, titled like `#549 Hastings Fitness – Meter survey (Callum)`, and whoever is going is invited. Changing or removing the visit changes or removes the calendar entry.
- **Book visits from a job** too, on its Visits tab. Past visits count towards the job's labour cost.
- **Test mode**: to begin with, folders go in "ZZ – Job Hub TEST" in the shared drive and visits go in a "Job Hub TEST" calendar. Your real folders and the real shared calendar aren't touched until you press **Go live** in Settings.
- **Settings** has a "Check the connection" button that tests every folder and calendar and says what works.

## 22/11/2026: Jobs, clients and people (Phase 1)
- All 49 jobs, 11 clients and 14 visits from the old app are brought in. Job #553 shows as part of #555, as it was merged.
- **Jobs**: a list of every job with its number, client and site, stage, who's on it, quote, money spent so far and profit with a green, amber or red light. Filter by Open, Quotes, Work on, Waiting for payment, Finished or All. On a phone it shows as cards.
- **A job's page** shows the number, client, site, stage and who's on it, the quote, spent so far and profit, and five tabs: Overview (with dated notes), Quote & money (the full working, and extras you can add and approve), Visits, Files (the Drive folder link) and Details (edit everything).
- **New jobs** start as TBC. The moment a job moves past Enquiry it gets the next number (557 is next). Two people can never get the same number.
- **Board**: every open job in a column per stage. Drag a card to move it; on a phone, use the menu on the card.
- **Clients**: each client with their jobs, work won and profit so far. Add and edit clients.
- **Search** at the top finds jobs by number (557, #557 or Q-557), client, site, postcode or anything in the notes.
- **Today**: live quotes, work on, invoiced but not paid, who's on site today, the next 7 days, and quotes sent more than 7 days ago with no answer.
- **Diary**: a list of visits from last week onwards.
- **Settings**: each person's day cost (£286 Cam, £286 Callum, £119 Jed, full cost at 100% work rate) and the profit light levels (green at 18%, red below 5%).
- A lost job shows no profit; its quote is shown crossed out.
- Sign-in now goes straight through Google (no Supabase), so the app can run on Replit.

## 22/11/2026: The empty app
- The app has the Batt look: white background, Batt blue, the cube logo, Inter text. It follows your phone or laptop's light or dark setting.
- Laptop: menu down the left. Phone: bar along the bottom.
- Sign in with Google only lets in @battelectrical.com accounts.
