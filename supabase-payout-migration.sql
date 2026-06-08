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

drop policy if exists "payout details own read or admin" on payout_details;
create policy "payout details own read or admin" on payout_details
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );

drop policy if exists "payout details own insert" on payout_details;
create policy "payout details own insert" on payout_details
  for insert with check (auth.uid() = user_id);

drop policy if exists "payout details own update" on payout_details;
create policy "payout details own update" on payout_details
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
