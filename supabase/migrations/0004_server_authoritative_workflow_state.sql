alter table public.project_versions
  add column if not exists current_step text not null default 'genre',
  add column if not exists workflow_state_json jsonb not null default '{}'::jsonb,
  add column if not exists save_revision integer not null default 0,
  add column if not exists last_saved_at timestamptz not null default now();

alter table public.project_versions
  drop constraint if exists project_versions_current_step_check;

alter table public.project_versions
  add constraint project_versions_current_step_check
  check (
    current_step in (
      'genre',
      'cover',
      'title',
      'layout',
      'style',
      'generation',
      'effects',
      'export'
    )
  );

create index if not exists project_versions_current_step_idx
  on public.project_versions(current_step);

create index if not exists project_versions_last_saved_at_idx
  on public.project_versions(last_saved_at desc);
