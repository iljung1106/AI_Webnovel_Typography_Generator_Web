create index if not exists projects_user_updated_idx
  on public.projects(user_id, updated_at desc)
  where status <> 'deleted';

create index if not exists project_versions_project_version_idx
  on public.project_versions(project_id, version_number desc);

create index if not exists jobs_active_generation_lookup_idx
  on public.jobs(user_id, project_id, version_id, created_at desc)
  where type = 'typography_generation'
    and status in ('queued', 'running');

create index if not exists assets_project_version_type_idx
  on public.assets(user_id, project_id, version_id, type)
  where deleted_at is null;

create or replace function public.list_user_work_items(
  p_user_id uuid,
  p_limit integer default 40
)
returns table (
  project_id uuid,
  version_id uuid,
  title text,
  genre text,
  status text,
  thumbnail_asset_id uuid,
  thumbnail_expired boolean,
  active_job_id uuid,
  updated_at timestamptz,
  completed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as project_id,
    v.id as version_id,
    coalesce(nullif(p.title, ''), nullif(v.title_text, ''), '타이포 작업')::text as title,
    g.name as genre,
    (
      case
        when aj.id is not null then 'generating'
        when p.status = 'completed' or v.current_step = 'export' then 'completed'
        else p.status
      end
    )::text as status,
    coalesce(v.selected_candidate_id, v.cover_asset_id) as thumbnail_asset_id,
    coalesce(thumb.expires_at is not null and thumb.expires_at <= now(), false) as thumbnail_expired,
    aj.id as active_job_id,
    greatest(p.updated_at, coalesce(v.last_saved_at, v.created_at, p.updated_at)) as updated_at,
    case
      when p.status = 'completed' or v.current_step = 'export'
        then coalesce(v.last_saved_at, p.updated_at)
      else null
    end as completed_at
  from public.projects p
  left join lateral (
    select pv.*
    from public.project_versions pv
    where pv.project_id = p.id
    order by pv.version_number desc
    limit 1
  ) v on true
  left join public.genres g
    on g.id = coalesce(v.genre_id, p.selected_genre_id)
  left join public.assets thumb
    on thumb.id = coalesce(v.selected_candidate_id, v.cover_asset_id)
    and thumb.deleted_at is null
  left join lateral (
    select j.id
    from public.jobs j
    where j.user_id = p_user_id
      and j.project_id = p.id
      and j.version_id = v.id
      and j.type = 'typography_generation'
      and j.status in ('queued', 'running')
    order by j.created_at desc
    limit 1
  ) aj on true
  where p.user_id = p_user_id
    and p.status <> 'deleted'
  order by greatest(p.updated_at, coalesce(v.last_saved_at, v.created_at, p.updated_at)) desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
$$;

revoke all on function public.list_user_work_items(uuid, integer) from public;
grant execute on function public.list_user_work_items(uuid, integer) to service_role;

create or replace function public.get_project_version_restore(
  p_user_id uuid,
  p_project_id uuid,
  p_version_id uuid
)
returns table (
  project_json jsonb,
  version_json jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    to_jsonb(p) - 'user_id' as project_json,
    to_jsonb(v) as version_json
  from public.projects p
  join public.project_versions v
    on v.project_id = p.id
  where p.user_id = p_user_id
    and p.id = p_project_id
    and p.status <> 'deleted'
    and v.id = p_version_id
  limit 1;
$$;

revoke all on function public.get_project_version_restore(uuid, uuid, uuid) from public;
grant execute on function public.get_project_version_restore(uuid, uuid, uuid) to service_role;
