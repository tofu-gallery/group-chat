-- Tofu, 2026-10-25: a role follows its person when they change their email address, and a new account never takes
-- over a role left on its address.
--
-- public.app_members is keyed by address, and before this file nothing moved a row when an address changed. Anyone
-- signed in can change their own address through the auth service (supabase.auth.updateUser({ email }), then the
-- confirmation link), which left their row on the old address: a person the owner had lowered to viewer came back as a
-- member (with no row, public.current_app_role() answers member), an admin who changed address became a member, and
-- the next account made with an old address took over the role left on it, admin included, because handle_new_user
-- kept a row it found there.
--
-- * After an address change (on_auth_user_email_changed), the person's row moves to the new address, and their name in
--   the chat (public.users.username, their address) follows. A row the new address already had goes first: an address
--   belongs to one account at a time, so that row was nobody's. An address taken away (only an admin of the auth
--   service can do that) takes its row with it, and a change of letter case alone moves nothing.
-- * handle_new_user gives a new account the role a new account gets, writing over any row left on its address: admin
--   while no other account holds a role, member otherwise. Rows left on addresses no account holds no longer count.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  address text := lower(nullif(new.email, ''));
begin
  insert into public.users (id, username)
  values (new.id, new.email);

  if address is not null then
    -- One new account at a time decides whether it is the first, so two at once cannot both become admin.
    perform pg_advisory_xact_lock(hashtext('public.app_members: first account'));
    insert into public.app_members (email, role)
    values (address, case when exists (
      select 1 from public.app_members m join auth.users u on m.email = lower(u.email) where u.id <> new.id
    ) then 'member' else 'admin' end)
    on conflict (email) do update set role = excluded.role, added_at = excluded.added_at;
  end if;

  return new;
end;
$$;

create function public.follow_address_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  old_address text := lower(nullif(old.email, ''));
  new_address text := lower(nullif(new.email, ''));
begin
  if old_address is not distinct from new_address then
    return new;
  end if;

  if new_address is not null then
    delete from public.app_members where email = new_address;
  end if;
  if old_address is not null then
    if new_address is null then
      delete from public.app_members where email = old_address;
    else
      update public.app_members set email = new_address where email = old_address;
    end if;
  end if;

  if new_address is not null then
    update public.users set username = new.email where id = new.id and username is not distinct from old.email;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute procedure public.follow_address_change();
