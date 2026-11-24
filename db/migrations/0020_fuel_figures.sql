-- Callum, 24/11/2026: fuel at £2.00 a litre and the vans at 35 mpg (about 26p a mile), for job profit.
-- Only fills them in if nothing has been set yet, so a later change in Settings is never overwritten.
update settings set value = '{"mpg": 35, "pencePerLitre": 200}', updated_at = now()
where key = 'fuel' and (value->>'mpg') is null and (value->>'pencePerLitre') is null;
