-- Admin courtesy grants are separate from Stripe payments and trial history.
create table if not exists public.manual_access_grants (
 id uuid primary key,
 user_id uuid not null,
 plan_id uuid not null references public.plans(id) on delete restrict,
 mode text not null check (mode in ('test','live')),
 credits integer not null check (credits between 0 and 1000000),
 features text[] not null, models text[] not null, max_batch integer not null,
 reason text not null, granted_by uuid not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 revoked_at timestamptz, revoked_by uuid
);
create index if not exists manual_access_grants_user_idx on public.manual_access_grants(user_id,mode,expires_at desc);
alter table public.manual_access_grants enable row level security;
revoke all on public.manual_access_grants from public,anon,authenticated;
grant select on public.manual_access_grants to authenticated;
grant all on public.manual_access_grants to service_role;
drop policy if exists "Own courtesy access readable" on public.manual_access_grants;
create policy "Own courtesy access readable" on public.manual_access_grants for select to authenticated using(user_id=auth.uid());
alter table public.credit_buckets drop constraint if exists credit_buckets_source_check;
alter table public.credit_buckets add constraint credit_buckets_source_check check(source in ('trial','subscription','upgrade','manual','prepaid','manual_access'));

create or replace function public.revoke_manual_access(_id uuid,_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare g record; b record;
begin
 if not public.has_role(_actor,'admin') then raise exception 'Acesso restrito ao administrador'; end if;
 select * into g from public.manual_access_grants where id=_id;
 if g is null then raise exception 'Liberação não encontrada'; end if;
 perform public._lock_user(g.user_id);
 select * into g from public.manual_access_grants where id=_id for update;
 if g.revoked_at is not null then return; end if;
 update public.manual_access_grants set revoked_at=now(),revoked_by=_actor where id=_id;
 for b in select * from public.credit_buckets where grant_key='manual_access:'||_id::text for update loop
   update public.credit_buckets set remaining=0,expires_at=now() where id=b.id;
   insert into public.credit_ledger(user_id,kind,source,delta,reason,bucket_id,actor_id)
    values(g.user_id,'expire','manual_access',-b.remaining,'Revogação de acesso manual',b.id,_actor);
 end loop;
 insert into public.audit_log(actor_id,action,target_type,target_id,reason,details)
  values(_actor,'manual_access_revoked','user',g.user_id::text,g.reason,jsonb_build_object('grant_id',g.id));
end; $$;
revoke execute on function public.revoke_manual_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_manual_access(uuid,uuid) to service_role;

create or replace function public.grant_manual_access(_id uuid,_uid uuid,_plan uuid,_days integer,_credits integer,_reason text,_actor uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare p record; pr record; g record; md text; ends timestamptz;
begin
 if not public.has_role(_actor,'admin') then raise exception 'Acesso restrito ao administrador'; end if;
 if _days is null or _days not between 1 and 3650 or _credits is null or _credits not between 0 and 1000000 or length(trim(coalesce(_reason,''))) not between 3 and 300 then raise exception 'Prazo, créditos ou motivo inválidos'; end if;
 perform public._lock_user(_uid);
 select stripe_mode into md from public.app_settings where id;
 select * into g from public.manual_access_grants where id=_id;
 if g.id is not null then
   if g.user_id<>_uid or g.granted_by<>_actor or g.mode<>md or g.plan_id<>_plan or g.credits<>_credits or g.reason<>trim(_reason) then raise exception 'Liberação divergente'; end if;
   return g.id;
 end if;
 select * into pr from public.profiles where id=_uid;
 if pr is null then raise exception 'Usuário não encontrado'; end if;
 if pr.status='blocked' then raise exception 'Desbloqueie a conta antes de liberar acesso'; end if;
 select * into p from public.plans where id=_plan and status='active' and archived_at is null;
 if p is null then raise exception 'Escolha um plano ativo'; end if;
 -- A new courtesy replaces a previous one without accumulating credits.
 for g in select id from public.manual_access_grants where user_id=_uid and mode=md and revoked_at is null for update loop
   perform public.revoke_manual_access(g.id,_actor);
 end loop;
 ends:=now()+make_interval(days=>_days);
 insert into public.manual_access_grants(id,user_id,plan_id,mode,credits,features,models,max_batch,reason,granted_by,expires_at)
 values(_id,_uid,_plan,md,_credits,p.allowed_features,p.allowed_models,p.max_batch,trim(_reason),_actor,ends);
 perform public.grant_credits(_uid,'manual_access',_credits,ends,'manual_access:'||_id::text,trim(_reason),_actor,null);
 insert into public.audit_log(actor_id,action,target_type,target_id,reason,details)
 values(_actor,'manual_access_granted','user',_uid::text,trim(_reason),jsonb_build_object('grant_id',_id,'plan_id',_plan,'days',_days,'credits',_credits,'expires_at',ends,'mode',md));
 return _id;
end; $$;
revoke execute on function public.grant_manual_access(uuid,uuid,uuid,integer,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.grant_manual_access(uuid,uuid,uuid,integer,integer,text,uuid) to service_role;

create or replace function public.access_state(_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pr record; s record; sub record; tr record; pl record; purchase record; courtesy record; is_admin boolean;
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
  select * into courtesy from public.manual_access_grants where user_id=_uid and mode=s.stripe_mode and revoked_at is null and expires_at>now() order by created_at desc limit 1;
  if courtesy.id is not null then
    return jsonb_build_object('ok',true,'code','manual','manual_grant_id',courtesy.id,
      'manual_ends_at',courtesy.expires_at,'plan_id',courtesy.plan_id,
      'features',to_jsonb(courtesy.features),'models',to_jsonb(courtesy.models),'max_batch',courtesy.max_batch);
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
