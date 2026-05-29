# Two-Phase Stability Plan

## Purpose

This plan fixes the current production-blocking issues in Fontasy without adding more temporary browser-side patches.

The main problem is not one isolated bug. The editor currently mixes server state, browser backup state, job polling state, and local completed records in ways that can disagree. The result is inconsistent restore behavior, confusing error messages, duplicated or missing works, and incomplete watermark protection.

The work should be split into two phases:

1. Make saved work restore reliably from the server.
2. Make credits, watermarking, preview policy, and polling behavior service-safe.

No product UI copy should include internal implementation explanations. Technical terms such as localStorage, workflow_state_json, Supabase request, or worker polling belong in docs and logs, not user-facing screens.

## Phase 1: Server-Authoritative Work Restore

### Goal

After this phase, a logged-in user should be able to start a project, close the browser, open the service in another browser, and continue from the latest saved workflow step.

The same project should appear consistently on the landing page, the My Works page, and direct project links.

### Problems Addressed

- The landing page reads recent works from browser storage only.
- The My Works page reads server projects and browser records together.
- Opening `/create` without a project ID resets the draft instead of restoring the active server draft.
- Browser backup state can overwrite or hide server state.
- `project_versions.current_step` and `workflow_state_json.activeStepId` can drift apart.
- Job and auto-save writes can race through `save_revision`, causing save failures even when the visible AI task succeeds.
- Save failures are shown in the same UI area as AI task failures, so a completed style/layout task can still display `Failed to fetch`.
- `/jobs/active` is requested even when the user is not on the generation step, creating noisy 404s.

### Implementation Scope

#### 1. Server Work List Becomes the Default Source

Update the landing page and My Works page so both use `GET /projects` as the primary list for logged-in users.

Browser records may remain as an emergency backup, but they must be visually and logically secondary. They should not be merged into the main server list as if they are official saved work.

Expected behavior:

- Landing page recent works and `/works` show the same server projects.
- Work cards link to `/create?projectId={project_id}&versionId={version_id}`.
- `/create?new=1` always starts a new project.
- `/create?projectId=...&versionId=...` always restores that exact server version.
- Plain `/create` should either start a new project intentionally or redirect to the latest active server draft. It must not silently overwrite a browser backup.

Recommended MVP decision:

- Keep `만들러 가기` as `/create?new=1`.
- Keep work continuation only through explicit server work cards.
- Do not auto-open an old draft from plain `/create`.

This is less magical and avoids accidental overwrite.

#### 2. Workflow State Save Must Merge Safely

The state endpoint currently accepts `baseRevision: null`, but the API update still filters by the current `save_revision`. That can create false conflicts when the API, worker, and browser update the same version close together.

Change the save strategy:

- Browser ordinary saves patch the full recoverable editor state.
- API state updates should fetch the latest state, merge client-editable sections, set `current_step`, force `workflow_state_json.activeStepId = current_step`, and then write.
- Worker and job updates should patch only job-owned sections.
- If true conflict handling is needed later, use section-level ownership instead of a single global revision for every writer.

Section ownership:

- Browser owns: selected genre, title, cover reference, layout manual transforms, style input, selected candidate, effects, export view state.
- API job creation owns: job IDs and queued/running status for layout, style, and generation.
- Worker owns: job terminal status, generated slots, candidate assets, transparent assets, job errors.
- Credit and license values are never trusted from workflow JSON.

#### 3. Keep `current_step` and `activeStepId` Synchronized

Every server writer must set both:

- `project_versions.current_step`
- `workflow_state_json.activeStepId`

Do not use `setdefault` for `activeStepId`. If a job moves the user-visible workflow state to layout/style/generation, write that step explicitly.

When restoring, if the two values disagree, the API response should prefer `current_step` and normalize the JSON before the frontend consumes it.

#### 4. Separate Save Status From AI Task Status

The UI needs two independent states:

- Save status: saving, saved, save failed.
- AI task status: layout/style/generation queued, running, succeeded, failed.

Save failures should not appear under the style or generation action button unless the action itself failed.

Recommended user-facing status:

- `저장 중`
- `저장됨`
- `저장 실패`
- `배치 생성 중`
- `스타일 정리 완료`
- `시안 생성 중`

The detailed API error should be logged for debugging, but the visible screen should not show raw `Failed to fetch`.

#### 5. Reduce Incorrect Active Job Fetches

Only call `GET /jobs/active` when the editor is restoring or displaying the generation step and there is reason to believe a generation job may still be running.

Do not call it on layout or style steps.

If the endpoint returns 404, treat it as "no active generation job" instead of a visible error.

#### 6. Make Step Navigation Honest While Saving

When the next step requires server creation or a blocking save, the Next button must show a visible busy state.

Expected behavior:

- Button text changes to a save/progress state.
- The button is disabled while the blocking request is in flight.
- If saving fails, the user sees a clear retry path.
- The editor must not show only a tiny footer text while ignoring the click.

### Phase 1 Verification

Manual checks:

- Create a new work, reach the style step, refresh, and confirm it opens at style with title/layout/style prompt restored.
- Open the same account in another browser and confirm the project appears under My Works.
- Click a landing recent work and confirm it opens the same server version.
- Start a new work from `만들러 가기` and confirm it does not load a previous work.
- Complete a style job and confirm no unrelated `Failed to fetch` appears under the button.
- Confirm `/jobs/active` 404 no longer appears during layout/style work.

Automated checks:

- Web typecheck.
- Web lint.
- Web production build.
- Python compile check for API and worker.
- API unit-level check for workflow state merge behavior if test harness exists.

## Phase 2: Credits, Watermarking, Preview Policy, And Polling Cost

### Goal

After this phase, free and paid usage rules should be visible, technically enforced, and hard to bypass through ordinary browser capture or stale client state.

The service should also reduce unnecessary Supabase/API traffic.

### Problems Addressed

- Free credit state can take too long to appear.
- Credit changes are not always reflected immediately across the side rail, settings, and generation screen.
- Worker polling creates regular Supabase requests even while idle.
- Frontend job polling can add request volume during long-running generation.
- Candidate previews need stronger watermarking than final free exports.
- Final free export watermark should be small, transparent, and placed over the actual typography area, not inside a background rectangle in a corner.
- Export preview currently shows the typography without watermark, allowing screenshot bypass.
- Free and paid license rules are not consistently tied to actual exported assets.
- Completed works are saved mainly in browser records, so another browser may not show them.

### Implementation Scope

#### 1. Credit State Cache And Immediate Refresh

Create one frontend credit state path used by:

- Side rail.
- Settings page.
- Generation step.
- Export step.

Use a small client-side cache so the UI can show the last known value immediately, then refresh from `/me/credits`.

After generation or paid export:

- Refresh credits immediately.
- Broadcast a credit update event only as a UI convenience.
- Do not rely on browser events as the source of truth.

If the server is slow, show a stable state such as `확인 중` only briefly, then either show cached values or a retry state.

#### 2. Worker Polling Cost Control

Render worker polling currently defaults to 2 seconds. This is acceptable for quick demos but wasteful for a low-volume service.

Recommended MVP setting:

- Increase idle polling interval to 8-15 seconds.
- Keep active Comfy/generation polling separate from idle job claim polling.
- Add exponential backoff when no jobs exist.
- Reset to the short interval after a job is claimed.

This reduces Supabase request volume without changing the architecture.

#### 3. Candidate Preview Watermark

Free candidate previews should use a stronger watermark than final exports.

Candidate policy:

- Apply a repeated/tiled watermark over the generated candidate image.
- Keep the candidate visible enough for selection.
- Do not use a white box watermark.
- Store this as the candidate preview asset shown in the UI.
- Keep the clean or transparent processing asset private and never expose it as the free candidate preview.

This prevents simple right-click or screenshot reuse of candidate previews.

#### 4. Export Preview Watermark

When a selected generation used free credits, every export/effect preview shown in the browser should include a preview watermark overlay.

This is separate from the final exported PNG watermark:

- Preview watermark: stronger and visible enough to discourage screenshot reuse.
- Final free PNG watermark: smaller, lighter, and placed over the typography region.
- Paid output: no watermark.

The preview canvas should not expose a clean final result for free generations.

#### 5. Final Free PNG Watermark

Final free PNG watermark should be drawn as text only:

- No rectangular background box.
- Semi-transparent gray/white text depending on local contrast.
- Positioned inside or near the actual typography bounding area.
- Small enough not to ruin legitimate preview use.
- Still visible enough to satisfy attribution and discourage direct uncredited commercial reuse.

If typography bounds are unavailable, derive them from placement/material dimensions.

#### 6. Server Export Records Become Completion Records

Completion should be represented server-side.

Recommended MVP:

- When the user clicks Complete, update the project/version state to `export`.
- Record completion metadata on the server.
- Make `/projects` list completed and draft works from server state.
- Browser completed records become legacy fallback only.

Exports already create `export_requests`; use those records for license and payment history, not browser local records.

#### 7. License Enforcement Boundaries

The client may display license information, but enforcement must be server-owned:

- Generation credit source comes from generation batch records.
- Export license type comes from export request records.
- Paid/free status must not be trusted from workflow JSON.
- Watermark removal or layer ZIP export requires a paid export claim.

User-facing license text should be short and practical. Detailed legal language belongs on the terms page.

### Phase 2 Verification

Manual checks:

- Free generation candidate previews show tiled preview watermark.
- Free export preview shows a preview watermark.
- Free downloaded PNG has only a small text watermark, no rectangle.
- Paid generation/export preview and downloads are clean.
- Taking a screenshot of the free export preview does not yield a clean usable result.
- Credits update immediately after generation and after layer ZIP claim.
- Settings, side rail, and generation screen show the same credit values.
- Another browser can see completed server work.
- Supabase request volume drops after worker idle interval/backoff changes.

Automated checks:

- Unit check for watermark drawing mode selection where possible.
- Web typecheck.
- Web lint.
- Web production build.
- Python compile check for API and worker.

## Out Of Scope For These Two Phases

- Full payment provider integration.
- Admin dashboard expansion beyond data needed by these fixes.
- Long-term version history or undo.
- Collaborative editing.
- Mobile redesign beyond fixing layout breakage caused by existing panels.
- Replacing Render/Supabase/Vercel architecture.

## Recommended Order

Implement Phase 1 first. It fixes data trust, restore, and confusing error behavior. Phase 2 depends on Phase 1 because watermark and credit policy need reliable server-owned project/version state.

Do not implement Phase 2 watermark and license rules while project restore is still split between browser and server. That would make the policy appear correct in one browser but disappear in another.
