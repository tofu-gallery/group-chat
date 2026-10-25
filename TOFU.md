# Group chat on Tofu

**What it is.** A chat room with channels. People sign in, post in channels and make new ones, and everyone signed in
sees new messages as they arrive. It is Supabase's realtime chat example: Next.js (pages router, React 18) in the
browser, and the database's own services behind it — Supabase Auth for accounts, the Data API for channels and
messages, Realtime for live updates.

**Upstream.** [supabase/supabase](https://github.com/supabase/supabase), folder `examples/slack-clone/nextjs-slack-clone`,
at commit `7e866ef83e89e35cdda45a6c98abd069d5fa1b2f` (2026-10-23; the last commit to touch the folder was in June 2026).
The folder lives inside the whole Supabase monorepo, which a fork could not hold under Tofu's archive limit, so this is a
new repository: its branch `main` holds the folder unchanged, with the repository's `LICENSE` beside it and one line at
the top of `README.md` naming the source. This branch, `tofu`, holds Tofu's changes, each commit with its reason.

## How Tofu runs it

- **Preset** `nextjs`, **root folder** the repository root, on Tofu's server hosting. Every page is prerendered; the
  browser talks to the database's services directly, so nothing runs on a server per request.
- **Install** `npm install` (from `package-lock.json`). **Build** `npm run build`, which is
  `node tofu/migrate.mjs && next build`. **Output** `.next`.
- **Database** Tofu's managed database, created with the first deploy. For a Next.js app Tofu writes
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the public key), the two names the app already
  reads (`lib/Store.js`), and `DATABASE_URL` and `SUPABASE_CA_CERT`, which only the build reads.
- **Migrations.** `tofu/migrate.mjs` applies `supabase/migrations` at the start of every build, in file-name order, each
  file once, recording each version in the Supabase CLI's own ledger (`supabase_migrations.schema_migrations`). It
  connects with `DATABASE_URL`, verifying the server against `SUPABASE_CA_CERT`. Tofu reads the build command as one that
  runs its own migration step and leaves the folder to it (checked with Tofu's own `migration-step.ts`: step `present`,
  the build may apply the folder). The files grant the Data API's roles exactly what the pages use and turn on
  row-level security for every table they make, so Supabase's change of 2026-10-30 (new tables closed to the Data API)
  changes nothing here. Any failure stops the build, so a version never goes online over a database without its tables.
- **Public settings** (all optional to the app; the gallery saves the first):
  - `NEXT_PUBLIC_TOFU_GOOGLE_SIGN_IN` = `true` shows **Continue with Google**, which signs people in through Tofu's
    sign-in service (`https://oauth.trytofu.ai/start?return=<the app's address>`). It needs no Google setup of the
    owner's and works for an app Tofu hosts once its first version is online. Elsewhere, leave it unset.
  - `NEXT_PUBLIC_DISABLE_SIGN_UP` = `true` closes sign-up (below).
  - No setting names the app's address: the app uses the address it is opened on.
- **Secrets.** None. Sessions are Supabase Auth's own, and the app needs no key of the owner's.

## Accounts, roles and sign-up

- **The first account made in the app becomes its admin** (exactly: an account made while no other account holds a
  role), and every account after it a member. Make your own account first. Admins delete any message and any channel
  (the app offers no way to delete `#public`, which everyone opens on); members post, make channels and delete their
  own; a **viewer** can read but not post, and is told so; nobody can edit a message once it is posted (the app has no
  edit, and the Data API refuses one). Roles are rows of `public.app_members` (one per email address), the table Tofu's
  People card reads: it shows each person's role, can lower a role on every plan and raise one on a paid plan.
- A viewer can still delete their own messages, and the channels they made with everything posted in them, as a member
  can (upstream's rule: a channel belongs to whoever made it). Removing the person instead leaves their channels with no
  creator, so only an admin can delete them.
- **A role follows its person.** Anyone signed in can change their own email address through the auth service; once
  the new address is confirmed, their row in `public.app_members` moves to it, and their name in the chat follows. A row
  the new address already had goes first (an address belongs to one account at a time, so it was nobody's), and an
  address taken away, which only an admin of the auth service can do, takes its row with it. A new account never takes
  over a role left on its address: it gets the role a new account gets.
- An account with no row is treated as a member. Only an account with no email address has none, because the table is
  keyed by address (Tofu's People card shows no role for it and cannot give it one); the app's pages sign people in by
  email or Google only, which always give an address, and while sign-up is closed the database makes no account but the
  ones the owner adds, which always have one.
- **Signing in on a new copy.** Continue with Google works at once. Email and password works as upstream's does —
  Supabase Auth asks each new address to confirm by email — but Tofu's first deploy does not write the app's sign-in
  settings (Tofu's `docs/app-auth.md`: the wiring skips with `no_address` before any version exists), so until the owner
  turns sign-in on from the app's Sign-in page in Tofu, the confirmation mail goes out through Supabase's built-in mailer,
  which Supabase limits to its organisation's own addresses and a few messages an hour (its published rule, not checked
  live here), so a new address may be refused with the auth service's own message. After that, mail comes from Tofu's
  sending address and its link returns to the app.
- **Closing sign-up.** Set `NEXT_PUBLIC_DISABLE_SIGN_UP` to `true` and deploy again. The build writes the switch into
  the database (`public.app_settings`), and from then on the database refuses every new account, by email or by Google,
  except the people the owner adds from Tofu's People card (**Add by email**, which marks the account as added by the
  owner). Those people have no password: they sign in with Continue with Google, with the same address. Setting it to
  anything else and deploying again opens sign-up again. Tofu's own **Only people you add** switch on the Sign-in page
  closes sign-up at the auth service instead and can be used beside it.
- **Removing a person** from Tofu's People card removes their profile, their messages and their role, so an address that
  comes back while sign-up is open starts as any new account does, never with a role it held before; the channels they
  made stay, with no creator, so only an admin can delete them.
- Each person's name in the chat is their email address, and everyone signed in sees it (upstream's design).

## What we changed, and why

- `supabase/migrations/20240214102356_init.sql` (changed; a note at its top lists the changes):
  - Roles come from `public.app_members` through `public.current_app_role()`, and `authorize()` checks a permission
    against it. Upstream read a custom claim that an auth hook added to each sign-in token — a hook Tofu's managed
    database does not run — and its sign-up trigger made anyone whose address contained `+supaadmin@` or `+supamod@` an
    admin or moderator, so anyone could promote themselves. The `admin`/`moderator` enum gave way to Tofu's three roles,
    and two permissions, `channels.create` and `messages.create`, say who may post (a viewer may not).
  - `public.create_user()` is gone: a `SECURITY DEFINER` function in `public`, callable by anyone through the Data API,
    that wrote accounts straight into `auth.users`. Only upstream's seed used it.
  - The `supabase_realtime` publication is added to, never dropped and made again (upstream dropped it, which on a
    database with other tables in it would stop their live updates).
  - `users.id` and `messages.user_id` cascade, and `channels.created_by` becomes empty, when an account is removed;
    upstream's foreign keys blocked removing anyone who had an account. An `after delete` trigger on `auth.users`
    (`forget_removed_member`) drops the person's row from `app_members`, which is keyed by address and would otherwise
    hand a returning address its old role, admin included.
  - The insert and update policies on `public.users` are gone and the Data API's roles may only read it: the trigger
    makes each profile, and upstream let anyone signed in rename themselves to anything, someone else's address included.
  - `revoke`/`grant` give `anon` nothing and `authenticated` what the pages use, except that this file still granted
    UPDATE on `messages` beside upstream's update policy, which the later file below takes back; every table has
    row-level security.
  - `public.app_settings` and the `before insert` trigger on `auth.users` (`refuse_closed_sign_up`) are the sign-up
    switch. The `after insert` trigger takes an advisory lock, so two first sign-ups at once cannot both become admin.
- `supabase/migrations/20240214114147_auth-hook.sql` (removed): the hook it made is no longer read, and nothing on Tofu
  would run it. `supabase/config.toml` no longer enables it, so the Supabase CLI still starts this folder locally.
- `supabase/migrations/20261025000000_tofu_starting_data.sql` (new): the role permissions, the two channels the app opens
  on (`public`, which the app sends everyone to as channel 1, and `random`) and the switch's row. Upstream kept these in
  `supabase/seed.sql`, which neither Tofu nor `supabase db push` runs, with a bot account and two messages made through
  `create_user()`. `supabase/seed.sql` and `full-schema.sql` (a copy of the old schema, with the same holes) are removed.
- `supabase/migrations/20261025200000_tofu_roles_follow_address_changes.sql` (new): an `after update of email` trigger
  on `auth.users` (`follow_address_change`) moves the person's row in `app_members` to their new address, deleting any
  row the new address had first, deletes it when the address is taken away, and renames their profile; and
  `handle_new_user` is replaced, so a new account writes over any row left on its address (`on conflict do nothing` let
  it take that row's role) and is the admin only while no other account holds a role. Without it a role stayed on the
  old address: a person lowered to viewer who changed address was a member again (no row reads as member), an admin who
  changed address became a member, and the next account made with that old address became admin. It is a new file
  rather than an edit of the init migration, so a database made from the earlier pin (`pin/2026-10-25`) gets it at its
  next build; a person who had already changed address there keeps the role the old rules left them.
- `supabase/migrations/20261025200100_tofu_messages_cannot_be_edited.sql` (new): drops upstream's policy "Allow
  individual update access" on `messages` (an author may update their message, with no permission check) and revokes
  UPDATE on `messages` from `anon` and `authenticated`. No page edits a message (`lib/Store.js` only reads, posts and
  deletes them), but through the Data API a person lowered to viewer could still rewrite every message they had posted
  and move it to another channel. `authenticated` now holds exactly what the pages use: SELECT on `users`; SELECT,
  INSERT and DELETE on `channels` and on `messages`.
- `tofu/migrate.mjs` (new) and the `build` script: the migrations and the sign-up switch, at the start of each build.
  It strips `sslmode` from `DATABASE_URL` and sets TLS itself, because node-postgres treats `sslmode=require` as full
  verification against the system's roots, which the managed database's pooler does not pass.
- `package.json` (no room for a note there): `next` pinned to `16.4.3` instead of `latest`; `jwt-decode` removed (roles
  no longer come from the token); `pg` added for the build script; the `export` script removed (`next export` no longer
  exists). `package-lock.json` (new) pins the rest; Vercel installs from it. The folder names no package of the
  monorepo's workspace (no `workspace:*` dependency), so none had to be replaced by a published version.
- `styles/style.css` (was `style.scss`): upstream imports SCSS without depending on `sass`, so a build stopped at the
  import; its two nested rules are written out as plain CSS.
- `components/Layout.js`: a channel's `next/link` no longer wraps an `<a>`, which Next.js 13 and later refuse at run
  time; the new-channel prompt asks for the channel's name (it said "Please enter your name"); a viewer is not offered
  New Channel.
- `pages/_app.js`: the role is read with `rpc('current_app_role')`; the auth listener is unsubscribed the way
  supabase-js v2 returns it (upstream's cleanup threw); a sign-in sends the person to `#public` only from the sign-in
  page, not on every later auth event (supabase-js reports one on token refreshes and on returning to the tab, which
  bounced people out of the channel they were in); the session is no longer logged to the console.
- `pages/index.js`: Continue with Google through Tofu; Sign up hidden while sign-up is closed, with a line saying so; a
  sign-up waiting for its confirmation mail now says so (supabase-js v2 answers it with a user and no session, which
  upstream's check missed, so nothing appeared); the confirmation link returns to the address the person signed up on.
- `pages/channels/[id].js`: a visitor who is not signed in is sent to the sign-in page (upstream showed an empty chat
  with no way to sign in); it sends people to `#public` only once the channels have loaded and the one asked for is not
  among them (upstream did so before they loaded, so `/channels/2` opened as `#public`); a viewer sees a line instead of
  the message box.
- `README.md`: its first line, the roles section and the schema link (each marked).
- `.env.example`: the Supabase CLI's local demo key (a public key, the same for every local stack) gave way to a
  placeholder, so the repository commits no key.

No analytics, tracker, ad, donation prompt or CI file was in the folder. Upstream's own local Supabase config keeps its
analytics off.

## Licence and caveats

- The Supabase repository is licensed **Apache-2.0** (`LICENSE`, copied from its root; it has no `NOTICE`); the
  example's own `package.json` says **MIT**. Both are permissive, so a copy needs no source offer. Every file Tofu
  changed carries a note at its top saying so, except the JSON files, which this file lists.
- `public/slack-clone-demo.gif` is upstream's animation of the example, kept for the README. The folder and the package
  are named after another company's chat product; nothing the app shows uses that name, and neither does the gallery.
- Realtime was not run here: it needs the Supabase stack. The migration puts `channels`, `messages` and `users` in the
  `supabase_realtime` publication with full replica identity, as upstream did, and Realtime sends signed-in people the
  rows their policies let them read; until a copy is checked live, live updates are the one part not seen working.
  Without them a new message still shows after a reload.
- Next.js 16 warns at build that React 18 support is deprecated (removed in Next.js 17); the app builds and runs.
- `npm audit` reports three moderate findings, all in `postcss-selector-parser` through Tailwind CSS 3 (slow parsing of
  crafted selectors), which runs only at build time over this app's own CSS. Fixing them means Tailwind CSS 4.
- Upstream behaviour kept: the open channel is not shown in bold (its id is compared as a string with a number), and
  channel names are made by the browser's own prompt.

## Verification

### Second round: the two fixes (`pin/2026-10-25.1`)

Run on 2026-10-25 on macOS, Node.js 22.22.3, npm 10.9.8, against a throwaway local PostgreSQL 14 database and nothing
outward (no deployment, no Docker; Next.js telemetry off with `NEXT_TELEMETRY_DISABLED=1`), from the tree as Tofu
deploys it: `git archive` of this branch at `31e4def` (the two fixes; the commit after it changes only this file), with
the execute bit taken off every file.

1. `npm ci`: 125 packages from `package-lock.json` (Next.js 16.4.3, supabase-js 2.118.0, pg 8.23.1). `npm run build`
   with `DATABASE_URL` on a stand-in for a new Supabase project, as in the first round (with Supabase's
   one-account-per-address index on `auth.users`): the migration step applied all four files, then `next build`
   compiled four static routes; a second run of the step applied none. Two sign-ups at once on an empty app made one
   admin and one member.
2. The same SQL against the first pin's two files and this branch's four, as the auth service, as the statements Tofu's
   People card sends, and as `authenticated` and `anon` with `request.jwt.claims` set. On the first pin: a member lowered
   to viewer updated his own message's text and moved it to `#random` (a row each); after he changed his address he was
   a member again, posted and made a channel; an admin who changed address became a member; a newcomer with the admin's
   old address became admin. On this branch: the viewer's updates were refused (`permission denied for table messages`);
   his row moved with his address, and he stayed a viewer and could neither post nor make a channel; the admin stayed
   admin; a newcomer with an old address, and one with an address carrying a planted admin row, became members; a change
   of letter case moved nothing; an address set to null took its row away. `authenticated` holds SELECT on `users` and
   SELECT, INSERT and DELETE on `channels` and `messages`, and nothing on the other tables; `anon` holds nothing; every
   table has row-level security; the publication holds the three tables.
3. Upgrade: a database the first pin's build had set up, with that state on it, took the two new files at this branch's
   build (the ledger then lists all four). After it, a lowered person who changed address stayed a viewer and could
   neither post nor edit, and a new account on an address an earlier address change had left an admin row on became a
   member. People who changed address before the upgrade keep the role the old rules left them.
4. Sign-up, the core action and removal, on a fresh database: a row left on an address nobody holds did not stop the
   first sign-up from becoming admin; a member posted in `#public` and read it back with his name and the channel, and
   could not delete `#public`; a person who changed address took their role and their name with them. With
   `NEXT_PUBLIC_DISABLE_SIGN_UP=true` the migration step closed the switch: a sign-up was refused ("Sign-up is closed in
   this chat: ask its owner to add you."), the statement Tofu's Add by email sends made a member, and a person could
   still change address, their role following. The statement Tofu's People card sends to remove someone removed the
   admin's profile, messages and role and left her channel with no creator; added back while others held roles, she was
   a member. Without the setting, the step opened the switch again.
5. `next start -H 127.0.0.1 -p 4391`: `/`, `/channels/1` and `/channels/2` answered 200. Headless Chromium as in the
   first round (the auth service and the Data API answered by a local stand-in over the same database, each query run as
   `authenticated` with the person's claims): Mike signed up and posted, and saw his message after a reload; Frank
   signed up and posted; lowered to viewer with the statement Tofu sends on the Free plan, Frank saw the read-only line
   and no message box or New Channel; a `PATCH` of his message sent from the page answered 403 (`permission denied for
   table messages`); after his address changed and he signed in with the new one, he was still a viewer, and his message
   was unedited and carried his new address as his name. No page error.
6. Tofu's own checks on the pushed branch at `31e4def`: `migration-step.ts` read step `present` and a build that may
   apply `supabase/migrations`, so Tofu leaves the folder to `tofu/migrate.mjs`; the gallery's shelf check (Tofu's GitHub
   import, the static lane's predicates and the safety check) said `safety ok (0 findings)` and 18 of 500 published
   files, not on the static lane.

### First round (`pin/2026-10-25`)

Run on 2026-10-25 on macOS, Node.js 22.22.3, npm 10.9.8, against a throwaway local PostgreSQL 14 database and nothing
outward (no deployment, no Docker):

1. `npm install`: 124 packages from `package-lock.json` (Next.js 16.4.3, React 18.3.1, supabase-js 2.118.0, pg 8.23.1).
2. A stand-in for a new Supabase project's starting state (an `auth` schema owned by `supabase_auth_admin` with
   `auth.users`, `auth.uid()`, `auth.role()`; the `anon`, `authenticated` and `service_role` roles; Supabase's
   pre-2026-10-30 default grants; the `supabase_realtime` publication; and a non-superuser owner of `public` standing in
   for `postgres`), then `DATABASE_URL=... node tofu/migrate.mjs` as that non-superuser: both files applied; a second
   run applied none.
3. SQL as the auth service and as the Data API's roles (with `request.jwt.claims` set): three sign-ups made three
   profiles, the first `admin` and the others `member`; the admin posted, made a channel and deleted a member's message
   and channel; the member could not delete the admin's message or `#public`, post as someone else, rename themselves or
   read `app_members`; a viewer could read but not post; `anon` could read nothing; `create_user()` and the hook function
   do not exist; inserts work with no sequence privileges (as after 2026-10-30); every table in `public` has row-level
   security; the publication holds `channels`, `messages` and `users`.
4. `NEXT_PUBLIC_DISABLE_SIGN_UP=true node tofu/migrate.mjs` closed the switch: a sign-up was refused with "Sign-up is
   closed in this chat: ask its owner to add you.", while an account written the way Tofu's Add by email writes it was
   made (as a member). Removing an account removed its profile, its messages and its `app_members` row and left its
   channel with no creator; removing the admin and signing up again with the same address gave a member. Run again
   without the setting, the switch opened.
5. `npm run build` (the migration step, then `next build`): compiled, four routes, all static. `next start -H 127.0.0.1`:
   `/`, `/channels/1` and `/channels/2` answered 200.
6. Headless Chromium (Playwright 1.64, `--use-mock-keychain --use-angle=swiftshader --enable-unsafe-swiftshader`), with
   the page's auth-service and Data API calls answered by a local stand-in from the same throwaway database (each query
   run as `authenticated` with the person's claims, so the database's own policies decided every answer): the sign-in
   page shows Continue with Google, Sign up and Login; signing up landed in `/channels/1` with `#public` and `#random`,
   New Channel and the admin's delete button on `#random`; a message posted there was shown after a reload with its
   author; the link to `#random` opened `/channels/2`; a signed-out visit to `/channels/1` went to `/`; a second person
   signing up saw the first person's message with no delete buttons. No page error.
7. A build with `NEXT_PUBLIC_DISABLE_SIGN_UP=true` hides Sign up and shows the closed line, and wrote the switch closed.
8. Tofu's `migration-step.ts` over these files: step `present`, and the build may apply `supabase/migrations`, so Tofu
   leaves the folder to `tofu/migrate.mjs`.
