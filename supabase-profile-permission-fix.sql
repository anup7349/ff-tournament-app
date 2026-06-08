grant usage on schema public to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.tournaments to anon, authenticated;
grant select, insert, update on public.squads to authenticated;
grant select on public.rooms to anon, authenticated;
grant select, insert, update on public.wallet_requests to authenticated;
grant select, insert on public.transactions to authenticated;
grant select, insert, update on public.payout_details to authenticated;
grant select, insert, update on public.withdraw_requests to authenticated;
grant select, insert, update on public.referral_codes to authenticated;
grant select, insert, update on public.referrals to authenticated;

alter table public.profiles enable row level security;

create or replace function public.is_admin(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = check_user_id),
    false
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select
  using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles update own or admin" on public.profiles
  for update
  using (auth.uid() = id or public.is_admin(auth.uid()))
  with check (auth.uid() = id or public.is_admin(auth.uid()));
