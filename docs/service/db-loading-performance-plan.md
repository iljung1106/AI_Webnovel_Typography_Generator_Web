# DB Loading Performance Plan

## Purpose

Fontasy currently feels slow whenever the UI waits for database-backed data:

- Landing page recent works.
- My Works page.
- Create page project/version restore.
- Credit values in the side rail and settings.

Loading indicators are required, but they only explain the wait. This plan also reduces the actual wait and lowers unnecessary Supabase/API request volume.

This plan should be implemented after the server-authoritative workflow restore work, and before adding heavier credit/license/watermark flows.

## Product Rule

The product UI must not expose implementation details.

Do not show phrases such as DB, Supabase, API request, worker polling, localStorage, RPC, or signed URL in user-facing screens.

Use simple state language:

- `작업을 불러오는 중`
- `최근 작업을 확인하는 중`
- `저장된 작업이 없습니다`
- `다시 시도`
- `크레딧 확인 중`

## Current Bottlenecks

### Work List

`GET /projects` is the critical path for both the landing page and My Works.

The current API shape can become slow if it:

- Fetches projects first.
- Then fetches the latest version for each project.
- Then checks active jobs for each version.
- Then resolves thumbnails or asset information separately.

That creates an N+1 pattern. It gets slower as the user has more projects, and it can consume Supabase request quota faster than expected.

### Create Page Restore

The create page currently needs project and version information to restore a workflow.

If it calls:

- `GET /projects/{project_id}`
- `GET /projects/{project_id}/versions/{version_id}`

then restore has at least two API/DB round trips before the editor can render the saved state.

### Credits

Credit values are useful in several places:

- Side rail.
- Settings page.
- Generation step.
- Export step.

If each screen independently requests credits, the UI feels inconsistent and the service sends avoidable requests.

### Worker Polling

The worker currently polls Supabase on a fixed interval. This is simple, but wasteful for a low-volume service when no jobs exist.

## Implementation Phases

## Phase A: Loading UX And Client-Side Cache

### Goal

Make every slow database-backed area understandable immediately, even before backend query optimization is complete.

This phase is lower risk and can be shipped quickly.

### A1. Add Loading States To Work Lists

Landing recent works:

- Show a compact skeleton grid while loading.
- If cached data exists, show cached cards immediately and a subtle refresh state.
- If loading fails, show no raw error text. Provide a retry action only if the section is important enough.

My Works:

- Show page-level skeleton cards.
- Keep the main page shell visible.
- If the user is not logged in, show the existing login-required empty state.
- If logged in and load succeeds with zero items, show `저장된 작업이 없습니다`.
- If loading fails, show `작업을 불러오지 못했어요` and `다시 시도`.

Create page restore:

- When opening `/create?projectId=...&versionId=...`, show a full editor loading state before the step UI appears.
- The top rail may render, but the main panel should not flash the genre step while restore is still in progress.
- If restore fails, show a clear recovery choice:
  - `내 작업으로 돌아가기`
  - `새로 만들기`

Credits:

- Show cached values immediately when available.
- If no cached value exists, show a compact loading chip.
- Do not block the whole editor on credits unless the user is about to spend credits.

### A2. Add Small Browser Cache For Read Models

Cache only server read-model responses, not authoritative workflow state.

Recommended cache keys:

- `fontasy:work-list:v1:{userId}`
- `fontasy:credit-summary:v1:{userId}`

Cache payload:

```json
{
  "cachedAt": "2026-05-31T12:00:00Z",
  "items": []
}
```

Rules:

- Cached work list can be shown immediately.
- Server response replaces cached data when it returns.
- Cache should be ignored after a short TTL, recommended 5 minutes.
- Cache must be cleared on logout.
- Cache must never create or mutate official projects.

### A3. Centralize Credit Fetching

Create one frontend credit fetch/cache helper used by all pages.

Expected behavior:

- One request per page load or explicit refresh.
- Immediate refresh after generation starts or paid export claim succeeds.
- Shared state event can update open components, but server response remains the source of truth.

### A4. Verification

Manual checks:

- Landing page shows recent-work skeleton or cached cards before server response.
- My Works never appears blank while loading.
- Create restore does not flash the genre step before the saved step appears.
- Credits do not stay as `확인 중` longer than necessary when cached values exist.

Automated checks:

- Web typecheck.
- Web lint.
- Web production build.

## Phase B: Backend Read Model Optimization

### Goal

Reduce actual database/API time by making the server return list and restore data with fewer database round trips.

### B1. Replace N+1 Work List With A Single Read Model

Create a Postgres function or view for the authenticated user's work list.

Recommended approach:

- Use a Supabase RPC function because it can select latest versions and active jobs in one query and can be called through the existing service-role API safely.
- Keep `GET /projects` as the public API contract.
- Change only the API internals to call the RPC.

Suggested RPC shape:

```sql
create or replace function public.list_user_work_items(p_user_id uuid, p_limit int default 40)
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
as $$
  -- final SQL should select each project once,
  -- join latest project_versions laterally,
  -- join active typography_generation job laterally,
  -- and order by projects.updated_at desc.
$$;
```

Expected API behavior:

- `GET /projects` performs one RPC call.
- It returns the same response shape as today.
- It does not create signed URLs.
- It does not fetch full workflow JSON.

### B2. Add Or Confirm Indexes

Add migrations for the indexes needed by the read model:

```sql
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
```

### B3. Add A Single Restore Endpoint

Add an endpoint:

```http
GET /projects/{project_id}/versions/{version_id}/restore
```

Response includes:

- Project title.
- Project status.
- Version fields.
- Normalized workflow state.

This replaces the frontend pair of:

- `GET /projects/{project_id}`
- `GET /projects/{project_id}/versions/{version_id}`

The old endpoints can stay for compatibility.

### B4. Avoid Signed URL Work In List Endpoints

Do not generate signed URLs inside `GET /projects`.

If thumbnails are needed later:

- Return `thumbnail_asset_id`.
- Let the frontend request visible thumbnail URLs lazily.
- Or add a dedicated thumbnail endpoint with caching headers.

### B5. Worker Polling Backoff

Change the worker loop from a fixed idle interval to backoff:

- Start idle delay at 2 seconds.
- If no job exists, increase delay up to 15 seconds.
- If a job is claimed, reset delay to 2 seconds.
- Keep generation provider polling separate from idle job claiming.

This reduces Supabase traffic while preserving acceptable latency for low-volume usage.

### B6. Verification

Manual checks:

- My Works loads noticeably faster with several saved projects.
- Landing and My Works show the same items.
- Restore opens the correct saved step using one restore endpoint.
- Render logs show fewer API calls during work list loading.
- Supabase request volume drops while worker is idle.

Automated checks:

- API compile check.
- Worker compile check.
- Web typecheck.
- Web lint.
- Web production build.
- If possible, add a lightweight API smoke script for:
  - `GET /projects`
  - `GET /projects/{project_id}/versions/{version_id}/restore`

## Recommended Implementation Order

1. Add loading states for landing, My Works, create restore, and credits.
2. Add browser cache for work list and credit summary.
3. Add work-list RPC migration and switch `GET /projects` to the RPC.
4. Add restore endpoint and switch create page restore to it.
5. Add worker idle backoff.
6. Run production build and deploy API, worker, and web together.

## Success Criteria

The work is successful when:

- A logged-in user does not see empty pages while DB-backed data is loading.
- Cached work cards appear quickly on repeat visits.
- Server response still replaces cached data.
- My Works and landing recent works agree.
- `/projects` no longer performs per-project version/job queries.
- Create page restore uses one API call for project+version state.
- Worker idle polling no longer hits Supabase every 2 seconds indefinitely.

## Out Of Scope

- Payment integration.
- Watermark policy changes.
- Admin dashboard expansion.
- Replacing Supabase.
- Full offline mode.
- Realtime subscriptions.

Realtime can be considered later for active generation progress, but it is not required to solve the current loading problem.
