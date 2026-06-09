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
    auth.uid() = referred_user_id
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin
    )
  )
  with check (
    auth.uid() = referred_user_id
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );

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
