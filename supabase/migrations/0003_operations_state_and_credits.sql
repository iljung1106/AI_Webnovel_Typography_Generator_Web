alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
  check (status in ('draft', 'active', 'completed', 'archived', 'expired', 'deleted'));

alter table public.project_versions
  add column if not exists status text not null default 'draft';

alter table public.project_versions
  drop constraint if exists project_versions_status_check;

alter table public.project_versions
  add constraint project_versions_status_check
  check (status in ('draft', 'generating', 'generated', 'effect_editing', 'exported', 'failed'));

alter table public.jobs
  add column if not exists idempotency_key text;

create unique index if not exists jobs_user_idempotency_key_idx
  on public.jobs(user_id, idempotency_key)
  where idempotency_key is not null and status in ('queued', 'running');

alter table public.generation_batches
  add column if not exists credit_source text not null default 'free',
  add column if not exists free_usage_date date,
  add column if not exists paid_credit_spent numeric(12, 4) not null default 0,
  add column if not exists paid_credit_refunded numeric(12, 4) not null default 0,
  add column if not exists sample_count integer not null default 3,
  add column if not exists succeeded_count integer not null default 0,
  add column if not exists failed_count integer not null default 0;

alter table public.generation_batches
  drop constraint if exists generation_batches_status_check;

alter table public.generation_batches
  add constraint generation_batches_status_check
  check (status in (
    'created',
    'queued',
    'charged',
    'running',
    'partially_succeeded',
    'succeeded',
    'failed',
    'timed_out',
    'settled',
    'refunded'
  ));

alter table public.generation_slots
  drop constraint if exists generation_slots_status_check;

alter table public.generation_slots
  add constraint generation_slots_status_check
  check (status in (
    'waiting',
    'queued',
    'uploading_input',
    'submitted_to_comfy',
    'running',
    'image_downloaded',
    'postprocessing',
    'succeeded',
    'comfy_failed',
    'download_failed',
    'postprocess_failed',
    'timed_out',
    'refunded'
  ));

alter table public.credit_ledger
  add column if not exists credit_type text not null default 'paid_credit',
  add column if not exists reason text,
  add column if not exists reference_type text,
  add column if not exists reference_id uuid;

alter table public.credit_ledger
  drop constraint if exists credit_ledger_credit_type_check;

alter table public.credit_ledger
  add constraint credit_ledger_credit_type_check
  check (credit_type in ('free_generation_credit', 'paid_credit'));

create table if not exists public.daily_free_credit_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  generation_batches_used integer not null default 0 check (generation_batches_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table if not exists public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key, window_start)
);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  event_type text not null,
  status text,
  message text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_id uuid not null references public.project_versions(id) on delete cascade,
  generation_slot_id uuid references public.generation_slots(id) on delete set null,
  export_type text not null check (
    export_type in ('final_png', 'transparent_png', 'layer_zip', 'watermark_removed_png')
  ),
  status text not null default 'queued' check (
    status in ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'refunded')
  ),
  credit_source text not null default 'free',
  paid_credit_spent numeric(12, 4) not null default 0,
  paid_credit_refunded numeric(12, 4) not null default 0,
  license_type text not null default 'free_attribution_required',
  watermark_applied boolean not null default true,
  asset_id uuid references public.assets(id) on delete set null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.user_delete_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'resolved', 'rejected')),
  request_message text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists daily_free_credit_usage_user_date_idx
  on public.daily_free_credit_usage(user_id, usage_date);

create index if not exists api_rate_limits_user_key_window_idx
  on public.api_rate_limits(user_id, key, window_start);

create index if not exists job_events_job_created_idx
  on public.job_events(job_id, created_at);

create index if not exists export_requests_user_created_idx
  on public.export_requests(user_id, created_at);

alter table public.daily_free_credit_usage enable row level security;
alter table public.api_rate_limits enable row level security;
alter table public.job_events enable row level security;
alter table public.export_requests enable row level security;
alter table public.user_delete_requests enable row level security;

drop policy if exists "daily free usage is user readable" on public.daily_free_credit_usage;
create policy "daily free usage is user readable"
  on public.daily_free_credit_usage for select
  using (auth.uid() = user_id);

drop policy if exists "job events follow job owner" on public.job_events;
create policy "job events follow job owner"
  on public.job_events for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_events.job_id and j.user_id = auth.uid()
    )
  );

drop policy if exists "export requests are user owned" on public.export_requests;
create policy "export requests are user owned"
  on public.export_requests for select
  using (auth.uid() = user_id);

drop policy if exists "delete requests are user owned" on public.user_delete_requests;
create policy "delete requests are user owned"
  on public.user_delete_requests for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
