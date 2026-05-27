create or replace function public.claim_next_job(
  worker_id text,
  supported_types text[] default null
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with next_job as (
    select j.id
    from public.jobs j
    where
      j.status = 'queued'
      and (
        supported_types is null
        or cardinality(supported_types) = 0
        or j.type = any(supported_types)
      )
      and (j.timeout_at is null or j.timeout_at > now())
    order by j.created_at asc
    for update skip locked
    limit 1
  )
  update public.jobs j
  set
    status = 'running',
    started_at = coalesce(j.started_at, now()),
    result_json = jsonb_set(
      coalesce(j.result_json, '{}'::jsonb),
      '{claimed_by}',
      to_jsonb(worker_id),
      true
    )
  from next_job
  where j.id = next_job.id
  returning j.*;
end;
$$;

revoke all on function public.claim_next_job(text, text[]) from public;
grant execute on function public.claim_next_job(text, text[]) to service_role;
