
-- ============ ENUMS ============
create type public.app_role as enum ('admin', 'subscriber');

-- ============ PROFILES & ROLES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  avatar_url text,
  status text not null default 'active' check (status in ('active','blocked')),
  block_reason text,
  selected_plan_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant update (name, avatar_url) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "Own profile readable" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Own profile updatable" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ============ PLANS ============
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency text not null default 'brl',
  billing_interval text not null default 'month' check (billing_interval in ('month','year')),
  credits_per_cycle integer not null default 0 check (credits_per_cycle >= 0),
  allowed_features text[] not null default array['invent','edit','compose','variation','vectorize'],
  allowed_models text[] not null default '{}',
  max_batch integer not null default 1 check (max_batch between 1 and 3),
  trial_override jsonb,
  highlight boolean not null default false,
  status text not null default 'draft' check (status in ('draft','active','inactive')),
  sort_order integer not null default 0,
  stripe_product_id_test text,
  stripe_price_id_test text,
  stripe_product_id_live text,
  stripe_price_id_live text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.plans to anon, authenticated;
grant all on public.plans to service_role;
alter table public.plans enable row level security;
create policy "Active plans are public" on public.plans for select to anon, authenticated using (status = 'active' or public.has_role(auth.uid(), 'admin'));

create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  mode text not null check (mode in ('test','live')),
  stripe_product_id text not null,
  stripe_price_id text not null unique,
  amount_cents integer not null,
  currency text not null,
  billing_interval text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.plan_prices(plan_id);
grant all on public.plan_prices to service_role;
alter table public.plan_prices enable row level security;

-- ============ SETTINGS & BRANDING ============
create table public.app_branding (
  id boolean primary key default true check (id),
  display_name text not null default 'Vupe Studio',
  logo_url text,
  favicon_url text,
  updated_at timestamptz not null default now()
);
grant select on public.app_branding to anon, authenticated;
grant all on public.app_branding to service_role;
alter table public.app_branding enable row level security;
create policy "Branding is public" on public.app_branding for select to anon, authenticated using (true);
insert into public.app_branding (id) values (true);

create table public.app_settings (
  id boolean primary key default true check (id),
  trial_enabled boolean not null default true,
  trial_duration_minutes integer not null default 4320 check (trial_duration_minutes >= 0),
  trial_credits integer not null default 10 check (trial_credits >= 0),
  trial_features text[] not null default array['invent','edit','compose','variation','vectorize'],
  trial_models text[] not null default '{}',
  stripe_mode text not null default 'test' check (stripe_mode in ('test','live')),
  ai_models jsonb not null default '{}'::jsonb,
  ai_defaults jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
insert into public.app_settings (id, ai_models, ai_defaults) values (true,
  '{"openai/gpt-image-2.5-sunburst":{"enabled":true},"openai/gpt-image-2.5-flare":{"enabled":true},"google/gemini-3-pro-image":{"enabled":true},"google/gemini-3.1-flash-image":{"enabled":true}}'::jsonb,
  '{"invent":"openai/gpt-image-2.5-sunburst","edit":"openai/gpt-image-2.5-sunburst","compose":"openai/gpt-image-2.5-sunburst","variation":"openai/gpt-image-2.5-flare"}'::jsonb);

create table public.stripe_credentials (
  mode text primary key check (mode in ('test','live')),
  publishable_key text,
  secret_key_enc text,
  secret_key_hint text,
  webhook_secret_enc text,
  webhook_secret_hint text,
  api_status text not null default 'not_tested',
  api_tested_at timestamptz,
  api_error text,
  webhook_validated_at timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
grant all on public.stripe_credentials to service_role;
alter table public.stripe_credentials enable row level security;

-- ============ TRIALS ============
create table public.trials (
  user_id uuid primary key,
  plan_id uuid,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  credits_granted integer not null default 0,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
grant select on public.trials to authenticated;
grant all on public.trials to service_role;
alter table public.trials enable row level security;
create policy "Own trial readable" on public.trials for select to authenticated using (user_id = auth.uid());

-- ============ STRIPE / BILLING ============
create table public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  mode text not null check (mode in ('test','live')),
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  unique (user_id, mode)
);
grant all on public.stripe_customers to service_role;
alter table public.stripe_customers enable row level security;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  mode text not null check (mode in ('test','live')),
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_status text not null,
  access_state text not null default 'awaiting_payment' check (access_state in ('awaiting_payment','active_paid','payment_failed','cancel_scheduled','ended','blocked_billing')),
  plan_id uuid,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  paid_through timestamptz,
  credited_period_start timestamptz,
  credited_amount integer not null default 0,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  last_stripe_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.subscriptions(user_id, mode);
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "Own subscriptions readable" on public.subscriptions for select to authenticated using (user_id = auth.uid());

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  stripe_invoice_id text not null unique,
  user_id uuid,
  mode text not null check (mode in ('test','live')),
  stripe_subscription_id text,
  stripe_customer_id text,
  plan_id uuid,
  stripe_price_id text,
  amount_due integer not null default 0,
  amount_paid integer not null default 0,
  amount_refunded integer not null default 0,
  currency text not null default 'brl',
  status text not null,
  billing_reason text,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  disputed boolean not null default false,
  hosted_invoice_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.invoices(user_id, mode);
grant select on public.invoices to authenticated;
grant all on public.invoices to service_role;
alter table public.invoices enable row level security;
create policy "Own invoices readable" on public.invoices for select to authenticated using (user_id = auth.uid());

create table public.stripe_events (
  id text primary key,
  mode text not null,
  type text not null,
  status text not null default 'received',
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
grant all on public.stripe_events to service_role;
alter table public.stripe_events enable row level security;

-- ============ CREDITS ============
create table public.credit_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null check (source in ('trial','subscription','upgrade','manual')),
  granted integer not null check (granted > 0),
  remaining integer not null check (remaining >= 0),
  expires_at timestamptz,
  grant_key text not null unique,
  invoice_id text,
  created_at timestamptz not null default now()
);
create index on public.credit_buckets(user_id);
grant select on public.credit_buckets to authenticated;
grant all on public.credit_buckets to service_role;
alter table public.credit_buckets enable row level security;
create policy "Own buckets readable" on public.credit_buckets for select to authenticated using (user_id = auth.uid());

create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  operation_item_id uuid not null unique,
  amount integer not null check (amount > 0),
  allocations jsonb not null default '[]'::jsonb,
  status text not null default 'held' check (status in ('held','consumed','released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index on public.credit_reservations(user_id, status);
grant select on public.credit_reservations to authenticated;
grant all on public.credit_reservations to service_role;
alter table public.credit_reservations enable row level security;
create policy "Own reservations readable" on public.credit_reservations for select to authenticated using (user_id = auth.uid());

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('grant','reserve','release','consume','expire','debit_manual')),
  source text,
  delta integer not null,
  reason text,
  operation_item_id uuid,
  bucket_id uuid,
  reservation_id uuid,
  invoice_id text,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index on public.credit_ledger(user_id, created_at desc);
grant select on public.credit_ledger to authenticated;
grant all on public.credit_ledger to service_role;
alter table public.credit_ledger enable row level security;
create policy "Own ledger readable" on public.credit_ledger for select to authenticated using (user_id = auth.uid());

-- ============ AGENTS ============
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  public_description text not null default '',
  image_url text,
  purpose text not null check (purpose in ('invent','create')),
  status text not null default 'inactive' check (status in ('active','inactive')),
  settings jsonb not null default '{}'::jsonb,
  allowed_plan_ids uuid[] not null default '{}',
  current_version integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.agents to authenticated;
grant all on public.agents to service_role;
alter table public.agents enable row level security;
create policy "Active agents visible" on public.agents for select to authenticated using (status = 'active' and deleted_at is null);

create table public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  version integer not null,
  name text not null,
  base_prompt text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);
grant all on public.agent_versions to service_role;
alter table public.agent_versions enable row level security;

-- ============ PROJECTS / ASSETS / OPERATIONS ============
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.projects(user_id);
grant select on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
create policy "Own projects readable" on public.projects for select to authenticated using (user_id = auth.uid() and deleted_at is null);

create table public.operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid,
  type text not null check (type in ('invent','edit','compose','variation','vectorize','logo_overlay')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','partial','failed')),
  agent_id uuid,
  agent_name text,
  agent_version integer,
  agent_version_id uuid,
  model text,
  user_instructions text not null default '',
  params jsonb not null default '{}'::jsonb,
  input_asset_ids uuid[] not null default '{}',
  requested_count integer not null default 1 check (requested_count between 1 and 3),
  credits_per_item integer not null default 1,
  charged boolean not null default true,
  idempotency_key text not null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index on public.operations(user_id, created_at desc);
grant select on public.operations to authenticated;
grant all on public.operations to service_role;
alter table public.operations enable row level security;
create policy "Own operations readable" on public.operations for select to authenticated using (user_id = auth.uid());

create table public.operation_items (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  user_id uuid not null,
  idx integer not null,
  status text not null default 'queued' check (status in ('queued','running','storing','succeeded','failed','uncertain')),
  reservation_id uuid,
  asset_id uuid,
  source_asset_id uuid,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  ai_returned_at timestamptz,
  storage_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, idx)
);
create index on public.operation_items(user_id);
create index on public.operation_items(status, started_at);
grant select on public.operation_items to authenticated;
grant all on public.operation_items to service_role;
alter table public.operation_items enable row level security;
create policy "Own items readable" on public.operation_items for select to authenticated using (user_id = auth.uid());

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid,
  operation_id uuid,
  operation_item_id uuid,
  parent_asset_id uuid,
  kind text not null check (kind in ('upload','result','vector','overlay')),
  role text,
  storage_path text not null,
  mime text not null,
  size_bytes integer not null,
  filename text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.assets(user_id, created_at desc);
create index on public.assets(project_id);
grant select on public.assets to authenticated;
grant all on public.assets to service_role;
alter table public.assets enable row level security;
create policy "Own assets readable" on public.assets for select to authenticated using (user_id = auth.uid() and deleted_at is null);

-- ============ AUDIT ============
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target_type text,
  target_id text,
  reason text,
  result text not null default 'success',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log(created_at desc);
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;

-- ============ SEED PLAN (no price -> checkout disabled until admin configures Stripe) ============
insert into public.plans (name, description, price_cents, credits_per_cycle, max_batch, status, sort_order, highlight)
values ('Essencial', 'Plano inicial. Preço e cobrança ainda não configurados pelo administrador.', null, 50, 3, 'active', 1, true);
