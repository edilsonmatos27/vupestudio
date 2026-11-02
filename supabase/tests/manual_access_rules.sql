-- Caller wraps this fixture in BEGIN / ROLLBACK; no real accounts or billing are altered.
DO $$
DECLARE uid uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); pid uuid; gid uuid:=gen_random_uuid(); gid2 uuid:=gen_random_uuid(); md text; rejected boolean; a jsonb; bal int; op uuid; res uuid;
BEGIN
 select stripe_mode into md from public.app_settings where id;
 insert into public.plans(name,status,trial_override) values('Manual access fixture','active','{"enabled":false}') returning id into pid;
 insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data,email_confirmed_at,created_at,updated_at)
 values(uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',uid||'@test.invalid',jsonb_build_object('plan_id',pid),now(),now(),now()),
 (actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',actor||'@test.invalid',jsonb_build_object('plan_id',pid),now(),now(),now());
 insert into public.user_roles(user_id,role) values(actor,'admin');
 update public.trials set ends_at=now()-interval '1 day',snapshot=jsonb_set(snapshot,'{granted}','true') where user_id=uid;
 assert public.access_state(uid)->>'code'='trial_expired';
 rejected:=false;
 begin perform public.grant_manual_access(gid,uid,pid,30,50,'Teste manual',uid); exception when others then rejected:=true; end;
 assert rejected,'Only admins may grant';
 perform public.grant_credits(uid,'manual',7,null,'unrelated:'||uid::text,'Unrelated adjustment',actor,null);
 perform public.grant_manual_access(gid,uid,pid,30,50,'Teste manual',actor);
 perform public.grant_manual_access(gid,uid,pid,30,50,'Teste manual',actor);
 select available into bal from public.credit_balance(uid); assert bal=57,'Idempotent grant must not duplicate credits';
 a:=public.access_state(uid); assert a->>'code'='manual' and (a->>'manual_ends_at')::timestamptz=now()+interval '30 days','Manual after expired trial';
 assert not exists(select 1 from public.invoices where user_id=uid),'No fabricated payment';
 assert not exists(select 1 from public.subscriptions where user_id=uid),'No fabricated subscription';
 update public.profiles set status='blocked' where id=uid;
 assert public.access_state(uid)->>'code'='blocked','Manual does not bypass account block';
 rejected:=false;
 begin perform public.grant_manual_access(gid2,uid,pid,30,50,'Blocked fixture',actor); exception when others then rejected:=true; end;
 assert rejected,'Cannot grant blocked accounts';
 update public.profiles set status='active' where id=uid;
 update public.manual_access_grants set expires_at=now()-interval '1 second' where id=gid;
 assert public.access_state(uid)->>'code'='trial_expired','Courtesy expires automatically';
 perform public.grant_manual_access(gid2,uid,pid,10,20,'Replacement fixture',actor);
 select available into bal from public.credit_balance(uid); assert bal=27,'Replacement expires previous grant only';
 update public.app_settings set stripe_mode=case md when 'live' then 'test' else 'live' end where id;
 assert public.access_state(uid)->>'code'='trial_expired','Environment isolation';
 update public.app_settings set stripe_mode=md where id;
 insert into public.operations(user_id,type,model,idempotency_key,requested_count) values(uid,'edit','m','manual-revoke',1) returning id into op;
 insert into public.operation_items(operation_id,user_id,idx) values(op,uid,0);
 perform public.reserve_operation_credits(op);
 select reservation_id into res from public.operation_items where operation_id=op;
 perform public.revoke_manual_access(gid2,actor); perform public.revoke_manual_access(gid2,actor);
 perform public.release_reservation(res,'Release after manual revocation');
 select available into bal from public.credit_balance(uid); assert bal=7,'Revocation preserves unrelated credits';
 assert public.access_state(uid)->>'code'='trial_expired','Revocation restores prior access rules';
 assert (select count(*) from public.audit_log where target_id=uid::text and action='manual_access_granted')=2,'Grant audit';
 insert into public.subscriptions(user_id,mode,stripe_customer_id,stripe_subscription_id,stripe_status,plan_id,paid_through,access_state)
 values(uid,md,'cus_manual_fixture','sub_'||uid,'active',pid,now()+interval '1 month','active_paid');
 perform public.grant_manual_access(gen_random_uuid(),uid,pid,30,0,'Courtesy alongside paid period',actor);
 assert public.access_state(uid)->>'code'='paid','Courtesy must not override existing paid rights';
 assert not has_function_privilege('authenticated','public.grant_manual_access(uuid,uuid,uuid,integer,integer,text,uuid)','EXECUTE');
 assert not has_table_privilege('authenticated','public.manual_access_grants','INSERT');
END $$;
