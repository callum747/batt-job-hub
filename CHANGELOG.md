# What's changed

Plain-English notes on what's new in the Batt Job Hub, newest first.

## 23/11/2026: Invoices (first part)
- **Invoices card on each job's Quote & money tab.** Pick what it's for: the next stage from the job's quote (e.g. "Deposit, on acceptance (25%): £1,825.00"), the final (what's left, with any approved extras listed), day rate, variation or other. The lines fill in; change anything that was agreed differently.
- **VAT or CIS:** a standard 20% VAT invoice, or a CIS invoice (reverse charge, no VAT, 20% of the labour deducted). For main contractors you must choose, so it's never guessed. The labour is suggested from the pricing sheet for you to check.
- **Make the invoice:** it gets the next number (INV-546 onwards, following the ledger), is made from your invoice template into the right VAT quarter folder (01 - VAT Invoices or 02 - CIS Invoices, made if the quarter is new), checked for leftover placeholders and that it fits on one page, saved as a PDF there and in the job's 01 folder, and added to the 00 - Batt Job Hub ledger.
- **Email it:** the covering email is drafted in your Gmail with the PDF attached. **Mark sent** and **Mark paid** fill the ledger's Sent Date and Paid Date. Paying the final invoice moves the job to Paid.
- **No gaps:** if an invoice fails part way, its number is used by the next one.
- **Test mode** makes TEST-INV numbers in the test folder and a test copy of the ledger. The real ledger and numbering aren't touched until you go live.

## 23/11/2026: Supplier invoices land on jobs by themselves
- **While anyone has the app open, every 30 minutes** it looks in info@ for new emails with a PDF that mention an invoice or credit note, and the assistant reads each PDF: supplier, invoice number, date, net, VAT, total and your order reference.
- **It goes straight on the job as a cost (before VAT) only when it's clear-cut:** it's an invoice or credit note (not a quote, statement or order confirmation), made out to Batt, net + VAT adds up to the total, and exactly one real job number is in the order reference (e.g. "#552 CBRE CROYDEN"). A credit note goes on as a minus. The cost shows on the job's Quote & money tab and comes off its profit.
- **Anything else waits in the Inbox under "Supplier invoices"** with the reason (no job number, two job numbers, amounts don't add up…). Type the job number, check the amount, and press **Put on job**, or **Not a job cost** for stock and tools.
- **The same invoice is never put on twice,** even if it's emailed again, and each email is only read once.
- **To switch it on:** sign in to the app once as info@battelectrical.com and press Connect Google, ticking the Gmail boxes. There's also a **Check now** button.

## 23/11/2026: The Inbox
- **Inbox** (in the menu) lists the last 30 days of emails in your own inbox from outside Batt that aren't on a job yet. Promotions, social and newsletters are left out, and so is anything with an existing job's number in the subject (it's on that job already). If the sender's company has an open job, it says so.
- **Make a job:** the assistant reads the email and fills in the client, contact name, email and phone, site, postcode, job type, what they want and any deadline. It also lists what's missing (e.g. "No site address"). Check it, change anything, and press **Create the job**. The job starts as an Enquiry with the email linked, and a new client is added with the contact details. An existing client keeps its details.
- **Add to a job:** type the job number and the email moves onto that job's Email tab.
- **Not a job:** clears it from the list. Nothing changes in Gmail.
- **Ask can do it too:** "what's new in my inbox?", "make a job from the Oak Road email".
- The assistant never guesses an address, postcode, phone or date. Anything not in the email is left blank.

## 23/11/2026: Email (first part)
- **Email the quote:** once a quote or survey proposal has its PDF, the Quote & money tab shows the covering email, already written: to the client's email, "Quotation 559 – project", the total with and without VAT, and your name. Change anything, then press **Save as a draft in Gmail**. The PDF is attached and the draft opens in Gmail for you to check and send. **The app never sends.** A line goes in the job's notes saying it was drafted.
- **Each job has an Email tab** showing its email threads: anything with the job number in the subject, or to or from the client's email, from the last two years, in everyone's connected mailbox. Your own threads open in Gmail.
- **Ask can do it too:** "draft the email for 559" or "any emails on 559?".
- **You need to connect Google once more** and tick the Gmail boxes (a blue bar at the top asks). Settings › check connection now shows Gmail too.
- Next: the Inbox (turn an enquiry email into a job) and wholesaler invoices landing on jobs by themselves.

## 23/11/2026: Ask fix
- Ask was turning every message down with "problem (400)". The app now sends the tool descriptions in the exact shape the service wants, carries on without any optional extra the service won't accept, and if anything is still refused it shows the real reason instead of a code.

## 23/11/2026: Ask (the chat assistant)
- **A new Ask screen** (in the menu, and on the phone's bottom bar where Clients was; Clients is now under More). Type what you need, like you would to Claude in chat: "Price job 559: 8 double sockets and 12 downlights in the kitchen, 2 people, 1 van", then "make the quote".
- **What it can do:** find jobs and clients, open a job's details and money, look things up in the price list, create a job, change a job's details, add a note, price a job in the pricing spreadsheet, make the short or long-form quote, move a job's stage when you ask, read the diary and the rates.
- **It uses the same machinery as the buttons,** so the same rules apply: prices only ever come from the pricing spreadsheet, Google stays in test mode until you go live, nothing is deleted and nothing is sent. Every change it makes is in the job's history as "(assistant)".
- **It asks rather than guesses** miles, prices, quantities or addresses, and checks the item list with you if anything was unclear before pricing.
- **You see what it's doing** as it works ("Pricing job 559 in the pricing spreadsheet" with a tick when done), and its answer appears as it's written.
- **Chats are saved,** so you can pick one up again from the list on the right, on any device. Each person only sees their own.
- **It needs an API key** before it works: add `ANTHROPIC_API_KEY` in Replit Secrets. Until then, Ask says how to switch it on.
- Not yet: emailing (drafts come with the email phase), surveys, reading drawings. Use the job's screens for those for now.

## 23/11/2026: Database setup repairs itself
- Publishing failed because the live database was half set up. The app now checks and finishes its database setup every time it starts, and the log says exactly what went wrong if it can't.

## 23/11/2026: The quote document (long form)
- **Long form or short form** on each priced job's Quote & money tab. Long form is suggested for £2,000 and over, tenders and main contractors; either can be chosen.
- **The long form is drafted from the pricing:** scope summary, the price grouped by section (power and data, lighting and so on) with travel as Preliminaries, the per-point rates for the items you priced, optional extras, a programme, and the appendix point schedule room by room with a lighting key.
- Tested on a real copy of your long-form template with five rooms, six sections, two fittings and Preliminaries: seven pages, no placeholders left, totals correct. The template's own note ("Add a row per room; delete this page for smaller jobs") is taken out so the client never sees it.

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
