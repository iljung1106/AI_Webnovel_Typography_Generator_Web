create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  google_sub text unique,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, google_sub, email, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'sub',
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null unique,
  draft_payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  claimed_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.genres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  example_asset_id uuid,
  default_style_hints_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'expired', 'deleted')),
  selected_genre_id uuid references public.genres(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  version_id uuid,
  type text not null check (
    type in (
      'cover',
      'layout_png',
      'candidate',
      'transparent_bw',
      'final_export',
      'advanced_png',
      'layer_zip'
    )
  ),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  width integer,
  height integer,
  size_bytes bigint,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (storage_bucket, storage_path)
);

create table if not exists public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_number integer not null,
  genre_id uuid references public.genres(id) on delete set null,
  title_text text not null,
  cover_asset_id uuid references public.assets(id) on delete set null,
  layout_json jsonb not null default '{}'::jsonb,
  style_input_json jsonb not null default '{}'::jsonb,
  style_resolved_json jsonb not null default '{}'::jsonb,
  selected_candidate_id uuid references public.assets(id) on delete set null,
  effect_settings_json jsonb not null default '{}'::jsonb,
  cover_placement_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

alter table public.assets
  add constraint assets_version_id_fkey
  foreign key (version_id) references public.project_versions(id) on delete cascade;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  version_id uuid references public.project_versions(id) on delete cascade,
  type text not null check (
    type in (
      'cover_analysis',
      'layout_generation',
      'style_resolution',
      'typography_generation',
      'export',
      'asset_cleanup'
    )
  ),
  status text not null default 'queued'
    check (status in (
      'queued',
      'running',
      'succeeded',
      'partially_succeeded',
      'failed',
      'timed_out',
      'cancelled'
    )),
  input_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  timeout_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.generation_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_id uuid not null references public.project_versions(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  credit_cost_total numeric(12, 4) not null default 0,
  credit_refunded_total numeric(12, 4) not null default 0,
  status text not null default 'created'
    check (status in (
      'created',
      'charged',
      'running',
      'partially_succeeded',
      'succeeded',
      'failed',
      'timed_out',
      'settled'
    )),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.generation_slots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.generation_batches(id) on delete cascade,
  slot_index integer not null check (slot_index between 1 and 3),
  seed bigint,
  status text not null default 'queued'
    check (status in (
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
    )),
  comfy_prompt_id text,
  candidate_asset_id uuid references public.assets(id) on delete set null,
  transparent_asset_id uuid references public.assets(id) on delete set null,
  error_code text,
  credit_cost numeric(12, 4) not null default 0,
  credit_refunded numeric(12, 4) not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  unique (batch_id, slot_index)
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (
    type in (
      'purchase',
      'generation_charge',
      'export_charge',
      'refund',
      'admin_adjustment',
      'free_grant'
    )
  ),
  amount numeric(12, 4) not null,
  balance_after numeric(12, 4) not null,
  related_project_id uuid references public.projects(id) on delete set null,
  related_batch_id uuid references public.generation_batches(id) on delete set null,
  related_export_job_id uuid references public.jobs(id) on delete set null,
  expires_at timestamptz,
  memo text,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  provider_payment_id text not null,
  status text not null,
  amount_paid numeric(12, 2) not null,
  currency text not null default 'KRW',
  credits_granted numeric(12, 4) not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_id uuid not null references public.project_versions(id) on delete cascade,
  candidate_id uuid references public.assets(id) on delete set null,
  type text not null check (type in ('basic_png', 'advanced_png', 'layer_zip')),
  job_id uuid references public.jobs(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  credit_cost numeric(12, 4) not null default 0,
  status text not null default 'draft'
    check (status in (
      'draft',
      'ready_to_export',
      'charging',
      'rendering_in_browser',
      'uploading',
      'succeeded',
      'failed',
      'refunded'
    )),
  created_at timestamptz not null default now()
);

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists project_versions_project_id_idx on public.project_versions(project_id);
create index if not exists assets_user_project_idx on public.assets(user_id, project_id);
create index if not exists jobs_status_created_idx on public.jobs(status, created_at);
create index if not exists jobs_user_id_idx on public.jobs(user_id);
create index if not exists generation_batches_user_id_idx on public.generation_batches(user_id);
create index if not exists generation_slots_batch_id_idx on public.generation_slots(batch_id);
create index if not exists credit_ledger_user_id_idx on public.credit_ledger(user_id, created_at);

alter table public.profiles enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.genres enable row level security;
alter table public.projects enable row level security;
alter table public.project_versions enable row level security;
alter table public.assets enable row level security;
alter table public.jobs enable row level security;
alter table public.generation_batches enable row level security;
alter table public.generation_slots enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.credit_purchases enable row level security;
alter table public.exports enable row level security;
alter table public.user_consents enable row level security;

create policy "profiles are user readable"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are user updatable"
  on public.profiles for update
  using (auth.uid() = id);

create policy "projects are user owned"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "project versions follow project owner"
  on public.project_versions for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_versions.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_versions.project_id and p.user_id = auth.uid()
    )
  );

create policy "assets are user owned"
  on public.assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "jobs are user owned"
  on public.jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "generation batches are user owned"
  on public.generation_batches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "generation slots follow batch owner"
  on public.generation_slots for select
  using (
    exists (
      select 1 from public.generation_batches b
      where b.id = generation_slots.batch_id and b.user_id = auth.uid()
    )
  );

create policy "credit ledger is user readable"
  on public.credit_ledger for select
  using (auth.uid() = user_id);

create policy "credit purchases are user readable"
  on public.credit_purchases for select
  using (auth.uid() = user_id);

create policy "exports are user owned"
  on public.exports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user consents are user owned"
  on public.user_consents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "active genres are public readable"
  on public.genres for select
  using (is_active = true);
