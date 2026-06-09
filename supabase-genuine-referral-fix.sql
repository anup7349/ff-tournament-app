grant usage on schema public to anon, authenticated;
grant select, insert, update on public.referral_codes to authenticated;
grant select, insert, update on public.referrals to authenticated;
grant select, update on public.profiles to authenticated;
grant insert on public.transactions to authenticated;

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;

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

drop policy if exists "referral codes public read" on public.referral_codes;
create policy "referral codes public read" on public.referral_codes
  for select using (true);

drop policy if exists "referral codes own insert" on public.referral_codes;
create policy "referral codes own insert" on public.referral_codes
  for insert with check (auth.uid() = user_id);

drop policy if exists "referral codes own update" on public.referral_codes;
create policy "referral codes own update" on public.referral_codes
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "referrals own read" on public.referrals;
create policy "referrals own read" on public.referrals
  for select using (
    auth.uid() = referrer_id
    or auth.uid() = referred_user_id
    or public.is_admin(auth.uid())
  );

drop policy if exists "referrals referred insert" on public.referrals;
create policy "referrals referred insert" on public.referrals
  for insert with check (auth.uid() = referred_user_id);

drop policy if exists "referrals own update" on public.referrals;
create policy "referrals own update" on public.referrals
  for update using (auth.uid() = referred_user_id or public.is_admin(auth.uid()))
  with check (auth.uid() = referred_user_id or public.is_admin(auth.uid()));

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
