-- Business-rule checks for credits, trial and invoices. Runs inside a DO block that
-- always raises at the end, so every change is rolled back. Read the TEST_RESULT line.
-- Expected (with the seeded active plan and trial = 10 credits):
-- trial_grant=10; after_repeat_start=10,trials=1; access=trial; after_reserve3=7/3;
-- after_consume2_release1=8/0; overdraw_blocked=true; after_overdraw=8; after_dup_manual=13;
-- access_after_expiry=trial_expired; inv1=granted,inv1_again=duplicate; after_paid=55;
-- up_same=no_difference,up_bigger=granted_difference; after_upgrade=85
DO $$
DECLARE uid uuid := gen_random_uuid(); op uuid; pid uuid; b record; r text := ''; res uuid; acc jsonb; s uuid;
BEGIN
  select id into pid from public.plans where status='active' limit 1;
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated', 'rt_'||uid||'@test.local', jsonb_build_object('plan_id', pid, 'name','RT'), now(), now(), now());
  select * into b from public.credit_balance(uid); r := r || 'trial_grant=' || b.available || ';';
  perform public.start_trial(uid); perform public.start_trial(uid);
  select * into b from public.credit_balance(uid);
  r := r || 'after_repeat_start=' || b.available || ',trials=' || (select count(*) from public.trials where user_id=uid) || ';';
  acc := public.access_state(uid); r := r || 'access=' || (acc->>'code') || ';';
  insert into public.operations(user_id,type,model,idempotency_key,requested_count) values (uid,'edit','m','k1',3) returning id into op;
  insert into public.operation_items(operation_id,user_id,idx) values (op,uid,0),(op,uid,1),(op,uid,2);
  perform public.reserve_operation_credits(op); perform public.reserve_operation_credits(op);
  select * into b from public.credit_balance(uid); r := r || 'after_reserve3=' || b.available || '/' || b.reserved || ';';
  for res in select reservation_id from public.operation_items where operation_id=op and idx<2 loop perform public.consume_reservation(res); perform public.consume_reservation(res); end loop;
  select reservation_id into res from public.operation_items where operation_id=op and idx=2;
  perform public.release_reservation(res,'t'); perform public.release_reservation(res,'t');
  select * into b from public.credit_balance(uid); r := r || 'after_consume2_release1=' || b.available || '/' || b.reserved || ';';
  begin perform public.admin_adjust_credits(uid, -999, 'x', null, gen_random_uuid()::text); r := r || 'overdraw=ALLOWED;';
  exception when others then r := r || 'overdraw_blocked=' || (sqlerrm like '%INSUFFICIENT_AVAILABLE%') || ';'; end;
  select * into b from public.credit_balance(uid); r := r || 'after_overdraw=' || b.available || ';';
  perform public.admin_adjust_credits(uid, 5, 'm', null, 'same');
  begin perform public.admin_adjust_credits(uid, 5, 'm', null, 'same'); exception when others then null; end;
  select * into b from public.credit_balance(uid); r := r || 'after_dup_manual=' || b.available || ';';
  update public.trials set ends_at = now() - interval '1 minute' where user_id=uid;
  acc := public.access_state(uid); r := r || 'access_after_expiry=' || (acc->>'code') || ';';
  insert into public.subscriptions(user_id,mode,stripe_customer_id,stripe_subscription_id,stripe_status,plan_id) values (uid,'test','cus','sub_'||uid,'active',pid) returning id into s;
  r := r || 'inv1=' || public.apply_invoice_credits(s,'in_1','subscription_create',50, now(), now()+interval '30 days') || ',inv1_again=' || public.apply_invoice_credits(s,'in_1','subscription_create',50, now(), now()+interval '30 days') || ';';
  select * into b from public.credit_balance(uid); r := r || 'after_paid=' || b.available || ';';
  r := r || 'up_same=' || public.apply_invoice_credits(s,'in_2','subscription_update',50, now(), now()+interval '30 days') || ',up_bigger=' || public.apply_invoice_credits(s,'in_3','subscription_update',80, now(), now()+interval '30 days') || ';';
  select * into b from public.credit_balance(uid); r := r || 'after_upgrade=' || b.available || ';';
  RAISE EXCEPTION 'TEST_RESULT %', r;
END $$;
