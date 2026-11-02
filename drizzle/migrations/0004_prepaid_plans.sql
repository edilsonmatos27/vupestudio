-- Existing plans/prices remain recurring. Converting a plan creates a new Stripe price.
alter table public.plans add column if not exists billing_type text not null default 'recurring'
  check (billing_type in ('recurring','one_time'));
alter table public.plan_prices add column if not exists billing_type text not null default 'recurring'
  check (billing_type in ('recurring','one_time'));

create table if not exists public.prepaid_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null references public.plans(id) on delete restrict,
  mode text not null check (mode in ('test','live')),
  stripe_customer_id text not null,
  stripe_price_id text not null,
  stripe_session_id text unique,
  stripe_invoice_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'brl',
  billing_interval text not null check (billing_interval in ('month','year')),
  credits integer not null check (credits >= 0),
  features text[] not null,
  models text[] not null,
  max_batch integer not null check (max_batch between 1 and 3),
  status text not null default 'pending' check (status in ('pending','paid','revoked')),
  paid_at timestamptz,
  paid_through timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists prepaid_purchases_access_idx on public.prepaid_purchases(user_id, mode, paid_through desc);
alter table public.prepaid_purchases enable row level security;
revoke all on public.prepaid_purchases from public, anon, authenticated;
grant select on public.prepaid_purchases to authenticated;
grant all on public.prepaid_purchases to service_role;
drop policy if exists "Own prepaid purchases readable" on public.prepaid_purchases;
create policy "Own prepaid purchases readable" on public.prepaid_purchases for select to authenticated
  using (user_id = auth.uid());

alter table public.credit_buckets drop constraint if exists credit_buckets_source_check;
alter table public.credit_buckets add constraint credit_buckets_source_check
  check (source in ('trial','subscription','upgrade','manual','prepaid'));

-- Only the server may call this after re-fetching both the session and its PAID invoice.
-- The ledger grant and paid access are atomic, idempotent and use the DB clock.
create or replace function public.apply_prepaid_invoice(_purchase uuid, _invoice text)
returns text language plpgsql security definer set search_path = public as $$
declare p record; inv record; ends timestamptz;
begin
  select * into p from public.prepaid_purchases where id = _purchase for update;
  if p is null then raise exception 'Compra não encontrada'; end if;
  perform public._lock_user(p.user_id);
  if p.status = 'revoked' then return 'revoked'; end if;
  if p.status = 'paid' then
    if p.stripe_invoice_id <> _invoice then raise exception 'Fatura divergente'; end if;
    return 'duplicate';
  end if;
  select * into inv from public.invoices where stripe_invoice_id = _invoice;
  if inv is null or inv.status <> 'paid' or inv.user_id is distinct from p.user_id
     or inv.mode <> p.mode or inv.plan_id is distinct from p.plan_id
     or inv.stripe_price_id is distinct from p.stripe_price_id
     or inv.currency <> p.currency or inv.amount_paid <> p.amount_cents
     or inv.disputed or inv.amount_refunded >= inv.amount_paid then
    raise exception 'Pagamento não confirmado ou divergente';
  end if;
  ends := now() + case when p.billing_interval = 'year' then interval '1 year' else interval '1 month' end;
  perform public.expire_bucket_sources(p.user_id, array['trial'], 'Início de período avulso pago');
  perform public.grant_credits(p.user_id, 'prepaid', p.credits, ends,
    'prepaid:' || _invoice, 'Créditos de compra avulsa', null, _invoice);
  update public.prepaid_purchases set status = 'paid', stripe_invoice_id = _invoice,
    paid_at = now(), paid_through = ends where id = p.id;
  update public.invoices set period_start = now(), period_end = ends where stripe_invoice_id = _invoice;
  return 'granted';
end; $$;
revoke execute on function public.apply_prepaid_invoice(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_prepaid_invoice(uuid, text) to service_role;

create or replace function public.revoke_prepaid_invoice(_invoice text, _reason text, _purchase uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare p record; b record;
begin
  select * into p from public.prepaid_purchases where stripe_invoice_id = _invoice or (id = _purchase and (stripe_invoice_id is null or stripe_invoice_id = _invoice)) for update;
  if p is null then return 'not_prepaid'; end if;
  perform public._lock_user(p.user_id);
  if p.status = 'revoked' then return 'duplicate'; end if;
  update public.prepaid_purchases set status = 'revoked', stripe_invoice_id = _invoice, paid_through = least(now(), paid_through) where id = p.id;
  for b in select * from public.credit_buckets where invoice_id = _invoice and source = 'prepaid' for update loop
    update public.credit_buckets set remaining = 0, expires_at = now() where id = b.id;
    insert into public.credit_ledger(user_id, kind, source, delta, reason, bucket_id, invoice_id)
      values (p.user_id, 'expire', 'prepaid', -b.remaining, _reason, b.id, _invoice);
  end loop;
  return 'revoked';
end; $$;
revoke execute on function public.revoke_prepaid_invoice(text, text, uuid) from public, anon, authenticated;
grant execute on function public.revoke_prepaid_invoice(text, text, uuid) to service_role;

create or replace function public.access_state(_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pr record; s record; sub record; tr record; pl record; purchase record; is_admin boolean;
begin
  select * into pr from public.profiles where id = _uid;
  if pr is null then return jsonb_build_object('ok', false, 'code', 'no_profile'); end if;
  is_admin := public.has_role(_uid, 'admin');
  select * into s from public.app_settings where id = true;
  if is_admin then
    return jsonb_build_object('ok', true, 'code', 'admin', 'is_admin', true, 'mode', s.stripe_mode);
  end if;
  if pr.status = 'blocked' then
    return jsonb_build_object('ok', false, 'code', 'blocked', 'reason', pr.block_reason);
  end if;
  select * into sub from public.subscriptions
    where user_id = _uid and mode = s.stripe_mode and paid_through is not null and paid_through > now()
      and access_state <> 'blocked_billing'
    order by paid_through desc limit 1;
  if sub.id is not null then
    select * into pl from public.plans where id = sub.plan_id;
    return jsonb_build_object('ok', true, 'code', 'paid', 'subscription_id', sub.id, 'plan_id', sub.plan_id,
      'billing_type', 'recurring', 'paid_through', sub.paid_through, 'features', to_jsonb(coalesce(pl.allowed_features, '{}')),
      'models', to_jsonb(coalesce(pl.allowed_models, '{}')), 'max_batch', coalesce(pl.max_batch, 1));
  end if;
  select * into purchase from public.prepaid_purchases
    where user_id = _uid and mode = s.stripe_mode and status = 'paid' and paid_through > now()
    order by paid_through desc, paid_at desc limit 1;
  if purchase.id is not null then
    return jsonb_build_object('ok', true, 'code', 'paid', 'billing_type', 'one_time',
      'plan_id', purchase.plan_id, 'paid_through', purchase.paid_through,
      'features', to_jsonb(purchase.features), 'models', to_jsonb(purchase.models),
      'max_batch', purchase.max_batch);
  end if;
  select * into tr from public.trials where user_id = _uid;
  if tr.user_id is not null and (tr.snapshot->>'granted')::boolean and tr.ends_at > now() then
    select * into pl from public.plans where id = tr.plan_id;
    return jsonb_build_object('ok', true, 'code', 'trial', 'plan_id', tr.plan_id, 'trial_ends_at', tr.ends_at,
      'features', coalesce(tr.snapshot->'features', '[]'::jsonb), 'models', coalesce(tr.snapshot->'models', '[]'::jsonb),
      'max_batch', coalesce(pl.max_batch, 1));
  end if;
  if tr.user_id is not null and (tr.snapshot->>'granted')::boolean then
    return jsonb_build_object('ok', false, 'code', 'trial_expired', 'trial_ends_at', tr.ends_at, 'plan_id', tr.plan_id);
  end if;
  return jsonb_build_object('ok', false, 'code', 'no_access', 'plan_id', pr.selected_plan_id);
end; $$;
