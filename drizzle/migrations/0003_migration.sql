
alter table public.assets add column purged_at timestamptz;
create index on public.assets(deleted_at) where deleted_at is not null and purged_at is null;

-- Atomically apply the credit allowance of a confirmed paid invoice (idempotent per invoice)
create or replace function public.apply_invoice_credits(_sub uuid, _invoice text, _billing_reason text, _plan_credits integer, _period_start timestamptz, _period_end timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare s record; diff int; key text;
begin
  select * into s from public.subscriptions where id = _sub for update;
  if s is null then return 'no_subscription'; end if;
  perform public._lock_user(s.user_id);
  if _billing_reason in ('subscription_create','subscription_cycle') then
    key := 'invoice:' || _invoice;
    if exists (select 1 from public.credit_buckets where grant_key = key) then return 'duplicate'; end if;
    -- franchise does not accumulate; trial credits do not migrate to the paid period
    perform public.expire_bucket_sources(s.user_id, array['subscription','upgrade','trial'], 'Início de novo período pago (franquia não acumulativa)');
    if _plan_credits > 0 then
      perform public.grant_credits(s.user_id, 'subscription', _plan_credits, _period_end, key, 'Franquia do período pago', null, _invoice);
    end if;
    update public.subscriptions set credited_period_start = _period_start, credited_amount = _plan_credits where id = _sub;
    return 'granted';
  elsif _billing_reason = 'subscription_update' then
    key := 'upgrade:' || _invoice;
    if exists (select 1 from public.credit_buckets where grant_key = key) then return 'duplicate'; end if;
    diff := _plan_credits - coalesce(s.credited_amount, 0);
    if diff <= 0 then return 'no_difference'; end if;
    perform public.grant_credits(s.user_id, 'upgrade', diff, coalesce(_period_end, s.current_period_end), key, 'Diferença de franquia por upgrade', null, _invoice);
    update public.subscriptions set credited_amount = coalesce(credited_amount,0) + diff where id = _sub;
    return 'granted_difference';
  end if;
  return 'ignored';
end; $$;
revoke execute on function public.apply_invoice_credits(uuid, text, text, integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_invoice_credits(uuid, text, text, integer, timestamptz, timestamptz) to service_role;
