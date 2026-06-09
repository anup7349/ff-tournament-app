create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  mobile text not null,
  free_fire_uid text,
  wallet_balance numeric not null default 0,
  winning_balance numeric not null default 0,
  referral_code text unique,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  match_date date,
  match_time text,
  map text,
  mode text,
  entry text,
  prize text,
  rules text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists squads (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  user_id uuid references profiles(id),
  name text not null,
  captain text not null,
  free_fire_uid text,
  contact text,
  players text,
  kills integer not null default 0,
  placement integer not null default 0,
  status text not null default 'Pending',
  entry_paid numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  round text,
  room_id text,
  password text,
  start text,
  map text,
  created_at timestamptz not null default now()
);

create table if not exists wallet_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  contact text,
  amount numeric not null,
  utr text not null,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);

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

create table if not exists withdraw_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  mobile text,
  upi text not null,
  amount numeric not null,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

create table if not exists referral_codes (
  user_id uuid primary key references profiles(id) on delete cascade,
  code text not null unique,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referred_user_id uuid not null unique references profiles(id) on delete cascade,
  referred_name text,
  watched_ads_count integer not null default 0,
  completed boolean not null default false,
  reward_granted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table tournaments enable row level security;
alter table squads enable row level security;
alter table rooms enable row level security;
alter table wallet_requests enable row level security;
alter table transactions enable row level security;
alter table payout_details enable row level security;
alter table withdraw_requests enable row level security;
alter table referral_codes enable row level security;
alter table referrals enable row level security;

create policy "profiles read own or admin" on profiles
  for select using (auth.uid() = id or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
create policy "profiles insert own" on profiles
  for insert with check (auth.uid() = id);
create policy "profiles update own or admin" on profiles
  for update using (auth.uid() = id or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create policy "tournaments public read" on tournaments for select using (true);
create policy "tournaments admin write" on tournaments
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create policy "squads public read" on squads for select using (true);
create policy "squads user insert" on squads for insert with check (auth.uid() = user_id);
create policy "squads admin update" on squads
  for update using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create policy "rooms public read" on rooms for select using (true);
create policy "rooms admin write" on rooms
  for all using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create policy "wallet requests own read or admin" on wallet_requests
  for select using (auth.uid() = user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
create policy "wallet requests user insert" on wallet_requests for insert with check (auth.uid() = user_id);
create policy "wallet requests admin update" on wallet_requests
  for update using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create policy "transactions own read or admin" on transactions
  for select using (auth.uid() = user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
create policy "transactions admin insert" on transactions
  for insert with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create policy "payout details own read or admin" on payout_details
  for select using (auth.uid() = user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
create policy "payout details own insert" on payout_details
  for insert with check (auth.uid() = user_id);
create policy "payout details own update" on payout_details
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "withdraw own read or admin" on withdraw_requests
  for select using (auth.uid() = user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
create policy "withdraw own insert" on withdraw_requests
  for insert with check (auth.uid() = user_id);
create policy "withdraw admin update" on withdraw_requests
  for update using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create policy "referral codes public read" on referral_codes for select using (true);
create policy "referral codes own insert" on referral_codes for insert with check (auth.uid() = user_id);
create policy "referral codes own update" on referral_codes for update using (auth.uid() = user_id);

create policy "referrals own read" on referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
create policy "referrals referred insert" on referrals
  for insert with check (auth.uid() = referred_user_id);
create policy "referrals own update" on referrals
  for update using (auth.uid() = referred_user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (auth.uid() = referred_user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create or replace function public.claim_referral_reward(
  referrals_needed integer default 1,
  reward_coins numeric default 10
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  reward_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'Login required';
  end if;

  select array_agg(id)
    into reward_ids
  from (
    select id
    from public.referrals
    where referrer_id = current_user_id
      and completed = true
      and reward_granted = false
    order by created_at
    limit referrals_needed
  ) claimable;

  if coalesce(array_length(reward_ids, 1), 0) < referrals_needed then
    return 0;
  end if;

  update public.referrals
    set reward_granted = true
  where id = any(reward_ids);

  update public.profiles
    set wallet_balance = wallet_balance + reward_coins
  where id = current_user_id;

  insert into public.transactions (user_id, type, amount, note)
  values (current_user_id, 'credit', reward_coins, 'Referral reward');

  return reward_coins;
end;
$$;

grant execute on function public.claim_referral_reward(integer, numeric) to authenticated;
