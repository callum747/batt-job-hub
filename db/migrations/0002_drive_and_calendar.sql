-- Phase 2: Drive folders and Google Calendar.

-- Each person's Google permission, so the app can act in Drive and Calendar as them.
-- The token is encrypted before it is stored.
create table google_tokens (
  email text primary key,
  refresh_token_enc text not null,
  scopes text not null default '',
  updated_at timestamptz not null default now()
);
alter table google_tokens enable row level security;

alter table jobs add column drive_error text not null default '';

alter table visits add column calendar_id text not null default '';
alter table visits add column calendar_error text not null default '';

-- Visits brought in from the old app are on the real shared calendar.
update visits
  set calendar_id = 'c_96bc4e2b7105b335bc9067b414e021bc010c2527d5940f5a3b69d49671e669e5@group.calendar.google.com'
  where calendar_event_id <> '';

-- Where the app works in Google. It starts in test mode: a clearly named test folder and
-- test calendar. Nothing in the real folders or the real calendar is touched until
-- someone switches to live in Settings.
insert into settings (key, value) values ('google', '{
  "mode": "test",
  "live": {
    "folders": {
      "Live": "1nO9zd2wLMahtVCg4WKx9wxuCN7dK5R98",
      "Lost": "1QjNqGJ9AxX69d2BGHiSy-g8qqVIF4eSr",
      "Active": "1BhgMY0MWJPe4DunbsCQRfiN0GGeTHznk",
      "Completed": "1afiMhq-Kke9STeVfrejvbbf87zEwHpy-"
    },
    "calendarId": "c_96bc4e2b7105b335bc9067b414e021bc010c2527d5940f5a3b69d49671e669e5@group.calendar.google.com"
  },
  "test": {
    "folders": {
      "Live": "1FA7pYfN2RCerMXHRQwePGS3KDfPRhUpS",
      "Lost": "1_5yE7283nhE4IfoagBCcykYquIaQwrFh",
      "Active": "18LaO6Ug4v2_2UD9OTTrAO9uNMH6Mpjr_",
      "Completed": "1JX2ZsJuppISjolwCWZxhpRIBk9GDlsE5"
    },
    "calendarId": ""
  }
}');
