alter table profiles
  add column if not exists referral_code text unique;

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

alter table referral_codes enable row level security;
alter table referrals enable row level security;

drop policy if exists "referral codes public read" on referral_codes;
create policy "referral codes public read" on referral_codes
  for select using (true);

drop policy if exists "referral codes own insert" on referral_codes;
create policy "referral codes own insert" on referral_codes
  for insert with check (auth.uid() = user_id);

drop policy if exists "referral codes own update" on referral_codes;
create policy "referral codes own update" on referral_codes
  for update using (auth.uid() = user_id);

drop policy if exists "referrals own read" on referrals;
create policy "referrals own read" on referrals
  for select using (
    auth.uid() = referrer_id
    or auth.uid() = referred_user_id
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );

drop policy if exists "referrals referred insert" on referrals;
create policy "referrals referred insert" on referrals
  for insert with check (auth.uid() = referred_user_id);

drop policy if exists "referrals own update" on referrals;
create policy "referrals own update" on referrals
  for update using (
    auth.uid() = referrer_id
    or auth.uid() = referred_user_id
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );
