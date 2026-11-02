-- Archive commercial offers without deleting their price/payment/history links.
alter table public.plans add column if not exists archived_at timestamptz;
alter table public.plans drop constraint if exists plans_archived_inactive;
alter table public.plans add constraint plans_archived_inactive
  check (archived_at is null or status = 'inactive');
