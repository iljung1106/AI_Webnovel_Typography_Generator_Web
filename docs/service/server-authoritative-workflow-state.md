# Server-Authoritative Workflow State

## Purpose

Fontasy must restore a logged-in user's work even if the browser is closed, refreshed, or opened from another device.

The current browser draft storage is useful for quick recovery, but it cannot be the service's source of truth. Production workflow state must be owned by the server and database. Browser storage should remain only as a fast cache and emergency backup.

## Decision

Use `project_versions.workflow_state_json` as the canonical workflow state for each typography attempt.

This keeps the existing project-centered model:

- `projects` represents one typography workspace.
- `project_versions` represents one attempt or direction inside that workspace.
- `jobs` represents asynchronous AI or export work.
- `assets` represents uploaded and generated files.

The MVP should not introduce a separate snapshot table. A snapshot table can be added later if full history, undo across sessions, or audit-grade state replay becomes necessary.

## Core Principle

The server is the source of truth.

The browser may keep a local copy for immediate UI response, but the browser copy must not be treated as the official record. If server state and browser state disagree, the server state wins unless the server cannot be reached and the user explicitly continues from a temporary browser backup.

## Data Model Changes

Add the following columns to `project_versions`.

```sql
alter table project_versions
  add column current_step text not null default 'genre',
  add column workflow_state_json jsonb not null default '{}'::jsonb,
  add column save_revision integer not null default 0,
  add column last_saved_at timestamptz not null default now();
```

Recommended constraints:

```sql
alter table project_versions
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
```

`save_revision` increments on each successful workflow state save. It prevents stale browser writes from overwriting a newer server state.

## Workflow State Shape

`workflow_state_json` stores the full recoverable state needed by the guided editor.

Recommended shape:

```json
{
  "schemaVersion": 1,
  "activeStepId": "effects",
  "selectedGenreId": "romance-fantasy",
  "title": "대충 로판 타이포 제목",
  "cover": {
    "assetId": "uuid",
    "name": "cover.png",
    "width": 1200,
    "height": 1800
  },
  "layout": {
    "canvas": { "width": 2000, "height": 1000 },
    "items": []
  },
  "style": {
    "userPrompt": "보석, 달빛, 우아한",
    "resolvedElements": ["gemstones", "crescent moon"],
    "resolvedStyles": ["fluid calligraphy", "pure black silhouette vector"],
    "jobId": "uuid",
    "status": "succeeded"
  },
  "generation": {
    "jobId": "uuid",
    "status": "succeeded",
    "creditSource": "free",
    "slots": [
      {
        "slotIndex": 1,
        "candidateAssetId": "uuid",
        "transparentAssetId": "uuid",
        "status": "succeeded"
      }
    ],
    "selectedCandidateId": "uuid"
  },
  "effects": {
    "presetId": "violet-crystal",
    "params": {},
    "layerParams": {},
    "placement": {
      "x": 0.5,
      "y": 0.78,
      "scale": 1,
      "rotation": 0
    }
  },
  "export": {
    "basicPngAssetId": null,
    "layerZipAssetId": null,
    "completedAt": null
  }
}
```

The JSON should store asset IDs, not large image data. Cover previews, generated candidates, transparent typography, and exports belong in Supabase Storage and are referenced through the `assets` table.

`current_step` and `workflow_state_json.activeStepId` must match. The duplicated column exists so lists and filters can read the current step without parsing the full JSON payload.

## State Ownership

The following fields must be restored from server state:

- Current workflow step.
- Selected genre.
- Title text.
- Uploaded cover asset reference.
- Layout canvas and title item transforms.
- Style input text.
- Resolved style and element tokens.
- Style resolution job ID and status.
- Generation job ID and status.
- Candidate slots and candidate asset IDs.
- Transparent typography asset IDs.
- Selected candidate ID.
- Effect preset ID.
- Effect material parameters.
- Effect layer parameters.
- Final typography placement over the cover.
- Export asset IDs and completion status.

The following fields may stay browser-only:

- Unsaved text currently being typed before debounce completes.
- UI panel open or collapsed state.
- Canvas viewport zoom and pan.
- Last visited project/version pointer.
- Temporary backup used when the network is unavailable.

## API Contract

Add a state patch endpoint.

```http
PATCH /projects/{project_id}/versions/{version_id}/state
```

Request:

```json
{
  "current_step": "effects",
  "workflow_state_json": {},
  "base_revision": 12
}
```

Response:

```json
{
  "project_id": "uuid",
  "version_id": "uuid",
  "current_step": "effects",
  "workflow_state_json": {},
  "save_revision": 13,
  "last_saved_at": "2026-05-29T12:00:00Z"
}
```

Rules:

- The API must authenticate the user.
- The API must verify that the project belongs to the authenticated user.
- The API must verify that the version belongs to the project.
- If `base_revision` is older than the current `save_revision`, return `409 Conflict`.
- The API should validate `current_step` against the known workflow steps.
- The API should reject state payloads above the configured size limit.
- The API should not trust credit source, ownership, asset ownership, or license status from the client. Those are enforced separately through jobs, assets, credits, and export records.

## Save Flow

Frontend state updates should follow this flow:

```text
User changes editor state
→ React state updates immediately
→ localStorage backup updates immediately
→ debounce for ordinary edits
→ PATCH workflow state to API
→ API increments save_revision
→ frontend stores latest save_revision
```

Ordinary edits use debounce, recommended at 1.5 seconds:

- Text edits.
- Dragging layout items.
- Dragging effect placement.
- Effect slider changes.
- Preset parameter edits.

Important events save immediately:

- Step transition.
- Project/version creation.
- Cover upload completion.
- Layout job creation.
- Layout job completion.
- Style job creation.
- Style job completion.
- Typography generation job creation.
- Typography generation completion.
- Candidate selection.
- Export creation.
- Completion.

Important events should not move the UI into a state that cannot be recovered unless the server save succeeds. If saving fails, the UI should keep the user on the current step and show a retryable save error.

## Restore Flow

When `/create` opens, restoration follows this order.

### Existing Work URL

If the URL has both `projectId` and `versionId`:

1. Fetch project and version from the API.
2. Validate ownership on the server.
3. Restore from `workflow_state_json`.
4. Use localStorage only as a backup if the server request fails.

### New Work URL

If the URL has `new=1`:

1. Start from an empty draft.
2. Do not load the most recent local draft.
3. Create the server project/version when the workflow first needs server state, or when the title is confirmed.

This prevents "create new" from accidentally reopening the previous work.

### Default Create URL

If the URL is `/create` without a project/version:

1. Start an empty draft.
2. Do not automatically open the last local or server work.
3. Do not silently duplicate a completed work.

A separate "continue recent work" action may open the last server project pointer. The generic create route should remain a clean start.

## Generation Recovery

Generation must survive page close and refresh.

When a generation job is created:

1. API creates the `jobs` row.
2. API charges the correct credit source.
3. Frontend immediately saves `generation.jobId`, `generation.status`, and `generation.creditSource` to server state.
4. Worker updates job status and result records.
5. Frontend polling updates workflow state when slots complete.

When the user reopens the work:

1. Restore `generation.jobId` from server state.
2. Fetch `/jobs/{job_id}`.
3. If the job is running, resume polling.
4. If the job succeeded, load candidate and transparent asset IDs.
5. If the job partially failed, show completed candidates and refund status.
6. If the job failed or timed out, show the failure state and refund status.

The frontend must disable duplicate generation requests while a generation job is active.

## Browser Storage Role

Browser storage remains useful, but it is not authoritative.

Allowed browser storage:

- `lastProjectId`.
- `lastVersionId`.
- Local backup of the latest draft state.
- Cached credit display.
- Cached recent work cards for faster first paint.

Browser storage must not be the only place where these exist:

- Completed work list.
- Selected candidate.
- Generation job state.
- Export state.
- Credit source.
- License status.

If localStorage is full, unavailable, or cleared, logged-in work must still restore from the server.

## Works List

The "내 작업" page should be server-first.

Recommended behavior:

1. Fetch `/projects`.
2. Render server projects and their latest version status.
3. Merge local backup items only if they are owned by the current user and do not duplicate a server project/version.
4. Prefer server links: `/create?projectId={projectId}&versionId={versionId}`.
5. Use local-only links only for temporary backups that have not been saved to the server.

The landing page's recent work section should follow the same server-first model. It may render cached local items during loading, but it should replace them with server results after the API returns.

## Conflict Handling

MVP conflict handling should be simple.

If the API returns `409 Conflict`:

1. Fetch the latest server version.
2. Compare `updated_at` and `save_revision`.
3. If the current browser state only contains UI-only changes, apply the server state.
4. If the browser has user edits that would be lost, show a recovery choice:
   - Continue with server version.
   - Save current browser copy as a new version.

The MVP does not need real-time collaboration. Personal accounts only are still the product rule.

## Error Handling

Save failures should be visible but not noisy.

Recommended states:

- `저장됨`: latest server save succeeded.
- `저장 중`: debounce or request in progress.
- `저장 실패`: server save failed, local backup exists.
- `다시 연결 중`: network unavailable or API unreachable.

The UI should not expose database, JSON, revision, migration, or internal API wording to users.

Developer logs may contain structured error codes, but user-facing text must remain product-level.

## Security Rules

- The browser must not send or store service role keys.
- The API must verify project ownership for every state read or write.
- The API must verify asset ownership when accepting asset IDs in state.
- The API must not accept credit balance, paid/free license status, or watermark status from `workflow_state_json`.
- RLS should remain enabled for user-owned records.
- Private asset access should use signed URLs.

## Migration From Current Behavior

The current localStorage draft can be used to seed server state once.

Migration flow:

1. User logs in.
2. App reads owned local draft.
3. If the draft has no server `projectId/versionId`, create a project/version.
4. Save the local draft into `workflow_state_json`.
5. Store the new `projectId/versionId` in localStorage as a pointer.
6. Future restores use the server version first.

Completed local records should be gradually reduced to cached cards. The server project list becomes the official list.

## Implementation Order

1. Add database migration for `current_step`, `workflow_state_json`, `save_revision`, and `last_saved_at`.
2. Extend version response schemas to include the new state fields.
3. Add `PATCH /projects/{project_id}/versions/{version_id}/state`.
4. Add a frontend workflow persistence module.
5. Replace direct localStorage source-of-truth reads with server-first restore.
6. Keep localStorage writes as backup writes.
7. Save immediately on critical workflow events.
8. Add debounce save for ordinary edits.
9. Update "내 작업" and landing recent works to server-first loading.
10. Add generation recovery from server job state.
11. Add tests for save, restore, conflict, and generation resume.

## Test Requirements

Backend tests:

- Authenticated user can save owned version state.
- User cannot save another user's version state.
- Invalid step is rejected.
- Stale `base_revision` returns conflict.
- Payload size limit is enforced.

Frontend tests:

- `/create?new=1` starts empty.
- `/create?projectId=&versionId=` restores server state.
- Local draft is used only when server restore fails.
- Step transition triggers immediate save.
- Ordinary edits debounce server save.
- Active generation job resumes polling after reload.
- Duplicate generation is disabled while the job is active.

Manual QA:

- Start a work, close the browser, reopen same URL, confirm state restoration.
- Start generation, close the browser, reopen while the job is running, confirm progress restoration.
- Open the same account on another browser, confirm server project appears in "내 작업".
- Clear localStorage, reopen a saved server project, confirm restoration still works.
- Use `new=1`, confirm no previous work is loaded.

## Non-Goals For MVP

- Full version history replay.
- Multi-user collaboration.
- Real-time conflict merging.
- Offline-first editing.
- Long-term browser-only guest project storage.

These can be introduced later if the product needs them, but they should not complicate the first production-ready persistence model.
