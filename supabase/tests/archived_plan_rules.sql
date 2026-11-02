-- Transaction-only fixture: caller must wrap this file in BEGIN / ROLLBACK.
DO $$
DECLARE pid uuid; uid uuid := gen_random_uuid(); md text; end_at timestamptz := now() + interval '1 month'; rejected boolean := false;
BEGIN
  select stripe_mode into md from public.app_settings where id;
  insert into public.plans(name,status,price_cents,stripe_price_id_test,trial_override)
    values ('Archive rule fixture','active',1900,'price_archive_fixture','{"enabled":false}') returning id into pid;
  insert into public.plan_prices(plan_id,mode,stripe_product_id,stripe_price_id,amount_cents,currency,billing_interval)
    values(pid,'test','prod_archive_fixture','price_archive_fixture',1900,'brl','month');
  insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data,email_confirmed_at,created_at,updated_at)
    values(uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',uid||'@test.invalid',jsonb_build_object('plan_id',pid,'name','Archive fixture'),now(),now(),now());
  insert into public.subscriptions(user_id,mode,stripe_customer_id,stripe_subscription_id,stripe_status,plan_id,paid_through,access_state)
    values(uid,md,'cus_archive_fixture','sub_'||uid,'active',pid,end_at,'active_paid');
  update public.plans set archived_at=now(),status='inactive' where id=pid;
  assert not exists(select 1 from public.plans where id=pid and archived_at is null), 'Archived plan must be absent from management list';
  assert not exists(select 1 from public.plans where id=pid and status='active'), 'Archived plan must not be sold';
  assert exists(select 1 from public.plan_prices where plan_id=pid), 'Stripe price mappings must remain';
  assert exists(select 1 from public.subscriptions where user_id=uid and plan_id=pid and paid_through=end_at), 'Existing contracts must remain';
  assert public.access_state(uid)->>'code'='paid', 'Paid access must remain';
  begin update public.plans set status='active' where id=pid; exception when check_violation then rejected:=true; end;
  assert rejected, 'Stale admin screens must not reactivate archived plans';
END $$;
