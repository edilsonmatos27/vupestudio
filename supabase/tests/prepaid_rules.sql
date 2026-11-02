-- Run inside a transaction, followed by ROLLBACK. No real Stripe calls or payments.
DO $$
DECLARE uid uuid := gen_random_uuid(); pid uuid; purchase uuid; purchase2 uuid; inv text := 'in_prepaid_' || gen_random_uuid();
  md text; balance int; a jsonb; granted text; until_at timestamptz; blocked boolean := false; sub uuid; op uuid; res uuid;
BEGIN
  select stripe_mode into md from public.app_settings where id;
  insert into public.plans(name,status,billing_type,price_cents,credits_per_cycle,trial_override)
    values ('Prepaid transaction test','active','one_time',1900,50,'{"enabled":false}') returning id into pid;
  insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data,email_confirmed_at,created_at,updated_at)
    values(uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',uid||'@test.invalid',jsonb_build_object('plan_id',pid,'name','Prepaid test'),now(),now(),now());
  insert into public.prepaid_purchases(user_id,plan_id,mode,stripe_customer_id,stripe_price_id,amount_cents,billing_interval,credits,features,models,max_batch)
    values(uid,pid,md,'cus_test','price_test',1900,'month',50,array['edit'],array['snapshot-model'],2) returning id into purchase;
  begin perform public.apply_prepaid_invoice(purchase,inv); exception when others then blocked := true; end;
  assert blocked, 'Missing/unpaid invoice must not grant';
  select available into balance from public.credit_balance(uid); assert balance = 0, 'No credits before paid invoice';
  a := public.access_state(uid); assert a->>'code' <> 'paid', 'No access before paid invoice';
  insert into public.invoices(stripe_invoice_id,user_id,mode,plan_id,stripe_price_id,stripe_customer_id,amount_due,amount_paid,currency,status)
    values(inv,uid,md,pid,'price_test','cus_test',1900,1900,'brl','paid');
  -- Wrong environment, amount and owner are all rejected.
  update public.invoices set mode = case md when 'test' then 'live' else 'test' end where stripe_invoice_id=inv;
  blocked := false;
  begin perform public.apply_prepaid_invoice(purchase,inv); exception when others then blocked := true; end;
  assert blocked, 'Wrong mode must not grant';
  update public.invoices set mode=md,amount_paid=1 where stripe_invoice_id=inv;
  blocked := false;
  begin perform public.apply_prepaid_invoice(purchase,inv); exception when others then blocked := true; end;
  assert blocked, 'Wrong amount must not grant';
  update public.invoices set amount_paid=1900,user_id=gen_random_uuid() where stripe_invoice_id=inv;
  blocked := false;
  begin perform public.apply_prepaid_invoice(purchase,inv); exception when others then blocked := true; end;
  assert blocked, 'Wrong owner must not grant';
  update public.invoices set user_id=uid where stripe_invoice_id=inv;
  -- Later admin edits cannot change this purchase's original allowance/features.
  update public.plans set credits_per_cycle=999,allowed_features=array['compose'] where id=pid;
  granted := public.apply_prepaid_invoice(purchase,inv); assert granted='granted';
  granted := public.apply_prepaid_invoice(purchase,inv); assert granted='duplicate';
  select available into balance from public.credit_balance(uid); assert balance=50, 'Exactly one snapshot allowance';
  select paid_through into until_at from public.prepaid_purchases where id=purchase;
  assert until_at=now()+interval '1 month', 'Monthly period must use DB clock';
  a := public.access_state(uid);
  assert a->>'code'='paid' and a->>'billing_type'='one_time' and a->'features'='["edit"]'::jsonb, 'Paid access must use snapshot: ' || a::text;
  assert (a->>'max_batch')::int=2 and a->'models'='["snapshot-model"]'::jsonb;
  update public.profiles set status='blocked' where id=uid;
  assert public.access_state(uid)->>'code'='blocked', 'Blocked users cannot use paid access';
  update public.profiles set status='active' where id=uid;
  update public.prepaid_purchases set paid_through=now()-interval '1 second' where id=purchase;
  assert public.access_state(uid)->>'code'<>'paid', 'Expired access must stop';
  update public.prepaid_purchases set paid_through=until_at where id=purchase;
  insert into public.operations(user_id,type,model,idempotency_key,requested_count) values(uid,'edit','snapshot-model','prepaid-refund-test',1) returning id into op;
  insert into public.operation_items(operation_id,user_id,idx) values(op,uid,0);
  perform public.reserve_operation_credits(op);
  select reservation_id into res from public.operation_items where operation_id=op;
  perform public.revoke_prepaid_invoice(inv,'test refund');
  perform public.release_reservation(res,'release after refund');
  perform public.revoke_prepaid_invoice(inv,'duplicate refund');
  granted := public.apply_prepaid_invoice(purchase,inv); assert granted='revoked', 'Replay must not restore refund';
  select available into balance from public.credit_balance(uid); assert balance=0, 'Refund expires only purchase credits';
  assert public.access_state(uid)->>'code'<>'paid', 'Refund revokes access';
  -- Zero credits still buys a period. Annual expiry and recurring access still work.
  insert into public.prepaid_purchases(user_id,plan_id,mode,stripe_customer_id,stripe_price_id,amount_cents,billing_interval,credits,features,models,max_batch)
    values(uid,pid,md,'cus_test','price_test',1900,'year',0,array['edit'],'{}',1) returning id into purchase2;
  insert into public.invoices(stripe_invoice_id,user_id,mode,plan_id,stripe_price_id,amount_due,amount_paid,currency,status)
    values(inv||'_year',uid,md,pid,'price_test',1900,1900,'brl','paid');
  perform public.apply_prepaid_invoice(purchase2,inv||'_year');
  select paid_through into until_at from public.prepaid_purchases where id=purchase2;
  assert until_at=now()+interval '1 year';
  insert into public.subscriptions(user_id,mode,stripe_customer_id,stripe_subscription_id,stripe_status,plan_id,paid_through,access_state)
    values(uid,md,'cus_test','sub_'||uid,'active',pid,now()+interval '2 months','active_paid') returning id into sub;
  a:=public.access_state(uid); assert a->>'billing_type'='recurring' and a->>'subscription_id'=sub::text, 'Existing subscription priority preserved';
  -- A reversal that arrives before fulfillment must permanently prevent a grant.
  insert into public.prepaid_purchases(user_id,plan_id,mode,stripe_customer_id,stripe_price_id,amount_cents,billing_interval,credits,features,models,max_batch)
    values(uid,pid,md,'cus_test','price_test',1900,'month',50,array['edit'],'{}',1) returning id into purchase;
  perform public.revoke_prepaid_invoice(inv||'_early','early refund',purchase);
  granted := public.apply_prepaid_invoice(purchase,inv||'_early'); assert granted='revoked', 'Refund before fulfillment must block concurrent grants';
  assert not has_function_privilege('authenticated','public.apply_prepaid_invoice(uuid,text)','EXECUTE');
  assert not has_function_privilege('anon','public.revoke_prepaid_invoice(text,text,uuid)','EXECUTE');
  assert not has_table_privilege('authenticated','public.prepaid_purchases','INSERT');
END $$;
