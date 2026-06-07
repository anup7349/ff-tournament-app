alter table profiles
  add column if not exists winning_balance numeric not null default 0;

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

alter table withdraw_requests enable row level security;

drop policy if exists "withdraw own read or admin" on withdraw_requests;
create policy "withdraw own read or admin" on withdraw_requests
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );

drop policy if exists "withdraw own insert" on withdraw_requests;
create policy "withdraw own insert" on withdraw_requests
  for insert with check (auth.uid() = user_id);

drop policy if exists "withdraw admin update" on withdraw_requests;
create policy "withdraw admin update" on withdraw_requests
  for update using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );
