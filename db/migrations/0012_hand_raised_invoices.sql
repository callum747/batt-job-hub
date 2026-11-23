-- Invoices Cameron raised by hand (found in Drive 23/11/2026, now in the ledger): keep the jobs in step.
-- Each update only happens once: it looks for its own note first.
update jobs set stage = 'Invoiced', updated_at = now(),
  notes = case when notes = '' then '' else notes || E'\n' end || '23/11/2026: INV-547 for £2,808.14 inc VAT raised by Cameron on 21/11/2026 (final). Recorded in the ledger.'
where number = 555 and notes not like '%INV-547%' and stage in ('Complete', 'In progress', 'Booked');

update jobs set updated_at = now(),
  notes = case when notes = '' then '' else notes || E'\n' end || '23/11/2026: INV-546 for £363.05 inc VAT raised by Cameron on 19/11/2026 (20% deposit). Recorded in the ledger.'
where number = 539 and notes not like '%INV-546%';
