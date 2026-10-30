
-- ============ HELPERS ============
create or replace function public._lock_user(_uid uuid) returns void
language sql volatile set search_path = public as $$
  select pg_advisory_xact_lock(hashtextextended(_uid::text, 4242));
$$;

-- updated_at trigger
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger t_profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger t_plans_touch before update on public.plans for each row execute function public.touch_updated_at();
create trigger t_subs_touch before update on public.subscriptions for each row execute function public.touch_updated_at();
create trigger t_inv_touch before update on public.invoices for each row execute function public.touch_updated_at();
create trigger t_agents_touch before update on public.agents for each row execute function public.touch_updated_at();
create trigger t_projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger t_ops_touch before update on public.operations for each row execute function public.touch_updated_at();
create trigger t_items_touch before update on public.operation_items for each row execute function public.touch_updated_at();

-- ============ CREDIT FUNCTIONS ============
create or replace function public.sweep_expired_credits(_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  for b in select id, remaining, source from public.credit_buckets
           where user_id = _uid and remaining > 0 and expires_at is not null and expires_at <= now()
           for update loop
    update public.credit_buckets set remaining = 0 where id = b.id;
    insert into public.credit_ledger(user_id, kind, source, delta, reason, bucket_id)
    values (_uid, 'expire', b.source, -b.remaining, 'Expiração de créditos do período', b.id);
  end loop;
end; $$;

create or replace function public.credit_balance(_uid uuid)
returns table(available integer, reserved integer)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select sum(remaining) from public.credit_buckets where user_id = _uid and (expires_at is null or expires_at > now())), 0)::int,
    coalesce((select sum(amount) from public.credit_reservations where user_id = _uid and status = 'held'), 0)::int;
$$;

create or replace function public.grant_credits(_uid uuid, _source text, _amount integer, _expires_at timestamptz, _grant_key text, _reason text, _actor uuid default null, _invoice text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if _amount is null or _amount <= 0 then return false; end if;
  perform public._lock_user(_uid);
  insert into public.credit_buckets(user_id, source, granted, remaining, expires_at, grant_key, invoice_id)
  values (_uid, _source, _amount, _amount, _expires_at, _grant_key, _invoice)
  on conflict (grant_key) do nothing returning id into new_id;
  if new_id is null then return false; end if;
  insert into public.credit_ledger(user_id, kind, source, delta, reason, bucket_id, invoice_id, actor_id)
  values (_uid, 'grant', _source, _amount, _reason, new_id, _invoice, _actor);
  return true;
end; $$;

-- expire unreserved remaining of buckets by source (used when a new paid cycle starts)
create or replace function public.expire_bucket_sources(_uid uuid, _sources text[], _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b record;
begin
  perform public._lock_user(_uid);
  for b in select id, remaining, source from public.credit_buckets
           where user_id = _uid and remaining > 0 and source = any(_sources) for update loop
    update public.credit_buckets set remaining = 0, expires_at = least(coalesce(expires_at, now()), now()) where id = b.id;
    insert into public.credit_ledger(user_id, kind, source, delta, reason, bucket_id)
    values (_uid, 'expire', b.source, -b.remaining, _reason, b.id);
  end loop;
end; $$;

-- Reserve credits for every item of an operation atomically
create or replace function public.reserve_operation_credits(_op uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  op record; it record; need int; avail int; b record; take int; left_ int; allocs jsonb; res_id uuid;
begin
  select * into op from public.operations where id = _op;
  if op is null then raise exception 'OPERATION_NOT_FOUND'; end if;
  perform public._lock_user(op.user_id);
  perform public.sweep_expired_credits(op.user_id);
  select count(*) * op.credits_per_item into need from public.operation_items i
   where i.operation_id = _op and i.reservation_id is null and i.status = 'queued';
  if need = 0 then return; end if;
  select coalesce(sum(remaining),0) into avail from public.credit_buckets
   where user_id = op.user_id and remaining > 0 and (expires_at is null or expires_at > now());
  if avail < need then raise exception 'INSUFFICIENT_CREDITS'; end if;
  for it in select id from public.operation_items where operation_id = _op and reservation_id is null and status = 'queued' order by idx loop
    left_ := op.credits_per_item; allocs := '[]'::jsonb;
    for b in select id, remaining from public.credit_buckets
             where user_id = op.user_id and remaining > 0 and (expires_at is null or expires_at > now())
             order by expires_at asc nulls last, created_at asc for update loop
      exit when left_ = 0;
      take := least(b.remaining, left_);
      update public.credit_buckets set remaining = remaining - take where id = b.id;
      allocs := allocs || jsonb_build_object('bucket_id', b.id, 'amount', take);
      left_ := left_ - take;
    end loop;
    if left_ > 0 then raise exception 'INSUFFICIENT_CREDITS'; end if;
    insert into public.credit_reservations(user_id, operation_item_id, amount, allocations)
    values (op.user_id, it.id, op.credits_per_item, allocs) returning id into res_id;
    update public.operation_items set reservation_id = res_id where id = it.id;
    insert into public.credit_ledger(user_id, kind, delta, reason, operation_item_id, reservation_id)
    values (op.user_id, 'reserve', -op.credits_per_item, 'Reserva para operação', it.id, res_id);
  end loop;
end; $$;

create or replace function public.consume_reservation(_res uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.credit_reservations where id = _res for update;
  if r is null or r.status <> 'held' then return false; end if;
  update public.credit_reservations set status = 'consumed', settled_at = now() where id = _res;
  insert into public.credit_ledger(user_id, kind, delta, reason, operation_item_id, reservation_id)
  values (r.user_id, 'consume', 0, 'Consumo confirmado: arquivo salvo (' || r.amount || ' crédito(s))', r.operation_item_id, _res);
  return true;
end; $$;

create or replace function public.release_reservation(_res uuid, _reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare r record; a jsonb;
begin
  select * into r from public.credit_reservations where id = _res for update;
  if r is null or r.status <> 'held' then return false; end if;
  perform public._lock_user(r.user_id);
  for a in select * from jsonb_array_elements(r.allocations) loop
    update public.credit_buckets set remaining = remaining + (a->>'amount')::int where id = (a->>'bucket_id')::uuid;
  end loop;
  update public.credit_reservations set status = 'released', settled_at = now() where id = _res;
  insert into public.credit_ledger(user_id, kind, delta, reason, operation_item_id, reservation_id)
  values (r.user_id, 'release', r.amount, coalesce(_reason, 'Liberação de reserva'), r.operation_item_id, _res);
  perform public.sweep_expired_credits(r.user_id);
  return true;
end; $$;

create or replace function public.admin_adjust_credits(_uid uuid, _delta integer, _reason text, _actor uuid, _key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare avail int; left_ int; b record; take int;
begin
  if _delta = 0 or _reason is null or length(trim(_reason)) = 0 then raise exception 'INVALID_INPUT'; end if;
  if _delta > 0 then
    perform public.grant_credits(_uid, 'manual', _delta, null, 'manual:' || _key, _reason, _actor, null);
  else
    perform public._lock_user(_uid);
    perform public.sweep_expired_credits(_uid);
    select coalesce(sum(remaining),0) into avail from public.credit_buckets
     where user_id = _uid and remaining > 0 and (expires_at is null or expires_at > now());
    if avail < abs(_delta) then raise exception 'INSUFFICIENT_AVAILABLE'; end if;
    left_ := abs(_delta);
    for b in select id, remaining, source from public.credit_buckets
             where user_id = _uid and remaining > 0 and (expires_at is null or expires_at > now())
             order by expires_at asc nulls last, created_at asc for update loop
      exit when left_ = 0;
      take := least(b.remaining, left_);
      update public.credit_buckets set remaining = remaining - take where id = b.id;
      insert into public.credit_ledger(user_id, kind, source, delta, reason, bucket_id, actor_id)
      values (_uid, 'debit_manual', b.source, -take, _reason, b.id, _actor);
      left_ := left_ - take;
    end loop;
  end if;
  return (select to_jsonb(x) from public.credit_balance(_uid) x);
end; $$;

-- ============ TRIAL ============
create or replace function public.start_trial(_uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; p record; dur int; cred int; feats text[]; models text[]; enabled boolean; ends timestamptz;
begin
  if exists (select 1 from public.trials where user_id = _uid) then return; end if;
  select * into s from public.app_settings where id = true;
  select pl.* into p from public.plans pl join public.profiles pr on pr.selected_plan_id = pl.id where pr.id = _uid;
  enabled := s.trial_enabled; dur := s.trial_duration_minutes; cred := s.trial_credits;
  feats := s.trial_features; models := s.trial_models;
  if p.trial_override is not null then
    enabled := coalesce((p.trial_override->>'enabled')::boolean, enabled);
    dur := coalesce((p.trial_override->>'duration_minutes')::int, dur);
    cred := coalesce((p.trial_override->>'credits')::int, cred);
    if p.trial_override ? 'features' then feats := array(select jsonb_array_elements_text(p.trial_override->'features')); end if;
    if p.trial_override ? 'models' then models := array(select jsonb_array_elements_text(p.trial_override->'models')); end if;
  end if;
  if not enabled or dur <= 0 then
    -- record that no trial was granted (prevents later grant on retries)
    insert into public.trials(user_id, plan_id, started_at, ends_at, credits_granted, snapshot)
    values (_uid, p.id, now(), now(), 0, jsonb_build_object('granted', false, 'reason', 'trial_disabled'));
    return;
  end if;
  ends := now() + make_interval(mins => dur);
  insert into public.trials(user_id, plan_id, started_at, ends_at, credits_granted, snapshot)
  values (_uid, p.id, now(), ends, cred, jsonb_build_object('granted', true, 'duration_minutes', dur, 'credits', cred,
    'features', to_jsonb(feats), 'models', to_jsonb(models), 'plan_id', p.id, 'plan_name', p.name))
  on conflict (user_id) do nothing;
  if found and cred > 0 then
    perform public.grant_credits(_uid, 'trial', cred, ends, 'trial:' || _uid::text, 'Créditos do período de teste', null, null);
  end if;
end; $$;

-- ============ AUTH TRIGGERS ============
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  begin
    pid := nullif(new.raw_user_meta_data->>'plan_id', '')::uuid;
  exception when others then pid := null; end;
  if pid is null or not exists (select 1 from public.plans where id = pid and status = 'active') then
    raise exception 'PLAN_INVALID: Escolha um plano ativo para concluir o cadastro.';
  end if;
  insert into public.profiles(id, email, name, selected_plan_id)
  values (new.id, new.email, coalesce(left(new.raw_user_meta_data->>'name', 120), ''), pid);
  insert into public.user_roles(user_id, role) values (new.id, 'subscriber') on conflict do nothing;
  if new.email_confirmed_at is not null then perform public.start_trial(new.id); end if;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.start_trial(new.id);
  end if;
  return new;
end; $$;

create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
for each row execute function public.handle_user_confirmed();

-- ============ ACCESS DECISION (server clock) ============
create or replace function public.access_state(_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pr record; s record; sub record; tr record; pl record; is_admin boolean;
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
  if sub is not null then
    select * into pl from public.plans where id = sub.plan_id;
    return jsonb_build_object('ok', true, 'code', 'paid', 'subscription_id', sub.id, 'plan_id', sub.plan_id,
      'paid_through', sub.paid_through, 'features', to_jsonb(coalesce(pl.allowed_features, '{}')),
      'models', to_jsonb(coalesce(pl.allowed_models, '{}')), 'max_batch', coalesce(pl.max_batch, 1));
  end if;
  select * into tr from public.trials where user_id = _uid;
  if tr is not null and (tr.snapshot->>'granted')::boolean and tr.ends_at > now() then
    select * into pl from public.plans where id = tr.plan_id;
    return jsonb_build_object('ok', true, 'code', 'trial', 'plan_id', tr.plan_id, 'trial_ends_at', tr.ends_at,
      'features', coalesce(tr.snapshot->'features', '[]'::jsonb), 'models', coalesce(tr.snapshot->'models', '[]'::jsonb),
      'max_batch', coalesce(pl.max_batch, 1));
  end if;
  if tr is not null and (tr.snapshot->>'granted')::boolean then
    return jsonb_build_object('ok', false, 'code', 'trial_expired', 'trial_ends_at', tr.ends_at, 'plan_id', tr.plan_id);
  end if;
  return jsonb_build_object('ok', false, 'code', 'no_access', 'plan_id', pr.selected_plan_id);
end; $$;

create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$ select public.access_state(auth.uid()) $$;

-- ============ ADMIN BOOTSTRAP (service role only) ============
create or replace function public.promote_to_admin(_email text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(_email) and email_confirmed_at is not null;
  if uid is null then return 'Usuário não encontrado ou e-mail não confirmado'; end if;
  insert into public.user_roles(user_id, role) values (uid, 'admin') on conflict do nothing;
  insert into public.audit_log(action, target_type, target_id, reason) values ('bootstrap_admin', 'user', uid::text, 'Provisionamento do admin master');
  return 'ok';
end; $$;

-- ============ RECONCILIATION (SQL only, run by pg_cron) ============
create or replace function public.reconcile_stale_operations() returns void
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  -- Items stuck without AI result for 30+ minutes: execution is uncertain; release (no commercial charge)
  for it in select * from public.operation_items
            where status in ('queued','running') and coalesce(started_at, created_at) < now() - interval '30 minutes' loop
    update public.operation_items set status = 'uncertain', finished_at = now(),
      error = 'Execução interrompida sem confirmação do resultado. Nenhum crédito foi cobrado.' where id = it.id;
    if it.reservation_id is not null then perform public.release_reservation(it.reservation_id, 'Execução interrompida/incerta'); end if;
  end loop;
  for it in select * from public.operation_items
            where status = 'storing' and coalesce(ai_returned_at, created_at) < now() - interval '30 minutes' loop
    update public.operation_items set status = 'failed', finished_at = now(),
      error = 'Falha ao salvar o arquivo. Nenhum crédito foi cobrado.' where id = it.id;
    if it.reservation_id is not null then perform public.release_reservation(it.reservation_id, 'Falha de armazenamento'); end if;
  end loop;
  -- Recompute operation statuses
  update public.operations o set status = case
      when x.ok = x.total then 'succeeded' when x.ok > 0 then 'partial' else 'failed' end
  from (select operation_id, count(*) total, count(*) filter (where status='succeeded') ok,
               count(*) filter (where status in ('queued','running','storing')) pending
        from public.operation_items group by operation_id) x
  where x.operation_id = o.id and x.pending = 0 and o.status in ('queued','running');
end; $$;

-- ============ PRIVILEGES ============
revoke execute on function public.sweep_expired_credits(uuid) from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, text, integer, timestamptz, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.expire_bucket_sources(uuid, text[], text) from public, anon, authenticated;
revoke execute on function public.reserve_operation_credits(uuid) from public, anon, authenticated;
revoke execute on function public.consume_reservation(uuid) from public, anon, authenticated;
revoke execute on function public.release_reservation(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_adjust_credits(uuid, integer, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.start_trial(uuid) from public, anon, authenticated;
revoke execute on function public.access_state(uuid) from public, anon, authenticated;
revoke execute on function public.promote_to_admin(text) from public, anon, authenticated;
revoke execute on function public.reconcile_stale_operations() from public, anon, authenticated;
revoke execute on function public.credit_balance(uuid) from public, anon, authenticated;
revoke execute on function public._lock_user(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;
grant execute on function public.sweep_expired_credits(uuid) to service_role;
grant execute on function public.grant_credits(uuid, text, integer, timestamptz, text, text, uuid, text) to service_role;
grant execute on function public.expire_bucket_sources(uuid, text[], text) to service_role;
grant execute on function public.reserve_operation_credits(uuid) to service_role;
grant execute on function public.consume_reservation(uuid) to service_role;
grant execute on function public.release_reservation(uuid, text) to service_role;
grant execute on function public.admin_adjust_credits(uuid, integer, text, uuid, text) to service_role;
grant execute on function public.start_trial(uuid) to service_role;
grant execute on function public.access_state(uuid) to service_role;
grant execute on function public.promote_to_admin(text) to service_role;
grant execute on function public.reconcile_stale_operations() to service_role;
grant execute on function public.credit_balance(uuid) to service_role;
grant execute on function public._lock_user(uuid) to service_role;
grant execute on function public.my_access() to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
