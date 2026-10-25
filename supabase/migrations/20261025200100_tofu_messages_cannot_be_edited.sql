-- Tofu, 2026-10-25: nobody can change a message once it is posted, which is all the app's pages offer.
--
-- The init migration kept upstream's policy "Allow individual update access" on public.messages (a message's author may
-- update it, with no permission check) and granted UPDATE on the table to the Data API's signed-in role, though no page
-- edits a message: lib/Store.js only reads, posts and deletes them. Through the Data API, a person the owner had lowered
-- to viewer could still rewrite every message they had posted before, and move it to another channel. The policy goes,
-- and so does the privilege: the signed-in role keeps SELECT, INSERT and DELETE on public.messages, the three the pages
-- use.

drop policy if exists "Allow individual update access" on public.messages;
revoke update on table public.messages from anon, authenticated;
