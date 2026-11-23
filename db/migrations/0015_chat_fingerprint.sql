-- Each chat remembers which version of the assistant's instructions and tools it was last run with, so the app
-- can tidy a saved conversation when those change (the service refuses old working-out otherwise).
alter table assistant_chats add column if not exists fingerprint text not null default '';
