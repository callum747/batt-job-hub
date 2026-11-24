-- What the vans' fuel really costs per mile, for job profit only (quotes still charge the mileage rate, which also
-- covers wear and tear). Empty until someone types in the vans' miles per gallon and the price of fuel.
insert into settings (key, value) values ('fuel', '{"mpg": null, "pencePerLitre": null}')
on conflict (key) do nothing;
