-- The end of each chat's latest answer, so a new chat can be told what the recent ones were about without loading them.
alter table assistant_chats add column if not exists last_reply text not null default '';
