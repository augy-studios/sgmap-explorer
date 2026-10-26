-- SG Map Explorer: the server's cache (main-site/api/_lib/store.js).
--
-- Run once in the Supabase SQL editor. Once run, this file is never edited: a later change is a
-- new file, 0002_..., run after it.
--
-- One table, read and written only by the site's Vercel Functions with the service role (or
-- sb_secret_) key. It keeps the layers that are slow to gather (every bus stop, every bicycle
-- rack, OneMap's themes list), as the trimmed replies the map gets, and the OneMap API token,
-- so every function instance shares one. Nothing about the people using the app is stored: there
-- are no accounts, sessions or visitor records, and no Supabase Auth.

create table if not exists public.server_cache (
  key text primary key,
  value jsonb not null,
  saved_at timestamptz not null default now()
);

comment on table public.server_cache is
  'SG Map Explorer server cache: trimmed layer snapshots and the OneMap token. Server-only.';

-- Row level security on with no policies: the anon and authenticated roles get nothing, and only
-- the service role, which bypasses RLS, reaches it.
alter table public.server_cache enable row level security;

revoke all on table public.server_cache from anon, authenticated;
