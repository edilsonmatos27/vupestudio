
-- Users may read only their own folder in the private assets bucket (server issues signed URLs too)
create policy "Own asset files readable" on storage.objects for select to authenticated
using (bucket_id = 'vupe-assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- pg_cron reconciliation (SQL only, hourly)
create extension if not exists pg_cron;
select cron.schedule('vupe-reconcile-stale-operations', '17 * * * *', $$ select public.reconcile_stale_operations(); $$);
