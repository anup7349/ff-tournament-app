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

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

create table if not exists payout_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  name text not null,
  mobile text,
  upi text,
  account_name text,
  bank_name text,
  account_number text,
  ifsc text,
  updated_at timestamptz not null default now()
);

alter table payout_details enable row level security;

drop policy if exists "profiles read own or admin" on profiles;
create policy "profiles read own or admin" on profiles
  for select using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "profiles insert own" on profiles;
create policy "profiles insert own" on profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles update own or admin" on profiles;
create policy "profiles update own or admin" on profiles
  for update using (auth.uid() = id or public.is_admin(auth.uid()))
  with check (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "tournaments admin write" on tournaments;
create policy "tournaments admin write" on tournaments
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "squads admin update" on squads;
create policy "squads admin update" on squads
  for update using (public.is_admin(auth.uid()));

drop policy if exists "rooms admin write" on rooms;
create policy "rooms admin write" on rooms
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "wallet requests admin update" on wallet_requests;
create policy "wallet requests admin update" on wallet_requests
  for update using (public.is_admin(auth.uid()));

drop policy if exists "transactions admin insert" on transactions;
create policy "transactions admin insert" on transactions
  for insert with check (public.is_admin(auth.uid()));

drop policy if exists "payout details own read or admin" on payout_details;
create policy "payout details own read or admin" on payout_details
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "withdraw own read or admin" on withdraw_requests;
create policy "withdraw own read or admin" on withdraw_requests
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "withdraw admin update" on withdraw_requests;
create policy "withdraw admin update" on withdraw_requests
  for update using (public.is_admin(auth.uid()));

drop policy if exists "referrals own read" on referrals;
create policy "referrals own read" on referrals
  for select using (
    auth.uid() = referrer_id
    or auth.uid() = referred_user_id
    or public.is_admin(auth.uid())
  );

drop policy if exists "referrals own update" on referrals;
create policy "referrals own update" on referrals
  for update using (
    auth.uid() = referrer_id
    or auth.uid() = referred_user_id
    or public.is_admin(auth.uid())
  );
