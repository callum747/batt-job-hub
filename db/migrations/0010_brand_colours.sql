-- People's colours move to the brand palette (black, Batt Blue, steel). Only the original defaults are
-- changed: a colour someone picked in Settings is left alone.
update people set colour = '#0B0D10' where short_name = 'Cam' and upper(colour) = '#7C3AED';
update people set colour = '#26A8E0' where short_name = 'Callum' and upper(colour) = '#0F766E';
update people set colour = '#5A6470' where short_name = 'Jed' and upper(colour) = '#C2410C';
