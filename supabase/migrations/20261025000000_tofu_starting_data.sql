-- Tofu: the starting data upstream kept in supabase/seed.sql, which neither Tofu nor `supabase db push` runs, so a new
-- database would have had no channel to open on and no role allowed to do anything. What each role may do, the two
-- channels the app opens on (it sends everyone to channel 1, `public`), and the sign-up switch's one row. Upstream's
-- seed also made a bot account through public.create_user(), which is gone (see the init migration).

insert into public.role_permissions (role, permission)
values
    ('admin', 'channels.create'),
    ('admin', 'channels.delete'),
    ('admin', 'messages.create'),
    ('admin', 'messages.delete'),
    ('member', 'channels.create'),
    ('member', 'messages.create');

insert into public.channels (slug)
values
    ('public'),
    ('random');

insert into public.app_settings (id, sign_up_open)
values (true, true);
