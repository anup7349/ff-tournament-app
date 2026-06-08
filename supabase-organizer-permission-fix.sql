grant usage on schema public to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.tournaments to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.squads to authenticated;
grant select, insert, update on public.wallet_requests to authenticated;
grant select, insert, update on public.withdraw_requests to authenticated;
grant select, insert, update on public.payout_details to authenticated;
grant select, insert, update on public.referral_codes to authenticated;
grant select, insert, update on public.referrals to authenticated;

alter table public.tournaments enable row level security;
alter table public.rooms enable row level security;
alter table public.squads enable row level security;

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

drop policy if exists "tournaments public read" on public.tournaments;
create policy "tournaments public read" on public.tournaments
  for select using (true);

drop policy if exists "tournaments admin write" on public.tournaments;
create policy "tournaments admin write" on public.tournaments
  for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "rooms public read" on public.rooms;
create policy "rooms public read" on public.rooms
  for select using (true);

drop policy if exists "rooms admin write" on public.rooms;
create policy "rooms admin write" on public.rooms
  for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "squads public read" on public.squads;
create policy "squads public read" on public.squads
  for select using (true);

drop policy if exists "squads user insert" on public.squads;
create policy "squads user insert" on public.squads
  for insert with check (auth.uid() = user_id);

drop policy if exists "squads admin update" on public.squads;
create policy "squads admin update" on public.squads
  for update using (public.is_admin(auth.uid()));

drop policy if exists "squads admin delete" on public.squads;
create policy "squads admin delete" on public.squads
  for delete using (public.is_admin(auth.uid()));
