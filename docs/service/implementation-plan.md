# Implementation Plan

## Purpose

This plan turns the product documents into an implementation sequence. It assumes the service will be rebuilt as a production app while preserving the behavior of the existing prototype modules.

Primary architecture:

- Next.js frontend.
- FastAPI backend.
- Python worker.
- Supabase Auth, Postgres, and Storage.
- Vercel for frontend hosting.
- Render for API/worker hosting.
- OpenRouter for text/layout prompting.
- Comfy Cloud for typography image generation.
- Browser WebGL for effect rendering and export.

## Non-Negotiable Implementation Rule

Existing working code must be reused, copied, or ported wherever possible.

The production implementation must preserve behavior from:

- `LayoutModule`
- `PromptGenerationModule`
- `ImageGenerationModule`
- `TypoEffector`
- `PrototypeWebApp`

See `docs/service/code-reuse-contract.md`.

## Master/Subagent Execution Model

The master agent owns architecture, integration, final review, and conflict resolution.

For implementation phases, use four subagents with disjoint ownership:

### Subagent 1: Frontend Workflow

Ownership:

- Next.js app shell.
- Route structure.
- Guest draft state.
- Step navigation.
- Genre/title/layout/style/generation/candidate/effect/export screens.
- User-facing copy constants.

Must read:

- `docs/design/DESIGN.md`
- `docs/service/product-brief.md`
- `docs/service/mvp-scope.md`

Must not own:

- Database migrations.
- Python AI modules.
- Credit ledger internals.

### Subagent 2: Backend API and Data

Ownership:

- FastAPI service.
- Supabase schema/migrations.
- RLS policy drafts.
- Project/version/job/asset APIs.
- Auth verification.
- Signed URL flow.

Must read:

- `docs/service/data-model-and-state.md`
- `docs/service/architecture.md`
- `docs/service/policy-and-operations-checklist.md`

Must not own:

- Browser rendering.
- Comfy workflow internals beyond API orchestration.

### Subagent 3: AI Worker and Prototype Module Port

Ownership:

- Worker loop.
- Job claiming.
- Layout generation wrapper.
- Style resolution wrapper.
- Comfy Cloud generation wrapper.
- Slot-level status updates.
- Black-to-transparent post-processing.
- Timeout and retry handling.

Must read:

- `docs/service/code-reuse-contract.md`
- `LayoutModule/typography_layout.py`
- `PromptGenerationModule/prompt_generator.py`
- `ImageGenerationModule/typography_image_generator.py`
- `ImageGenerationModule/comfy_cloud.py`
- `PrototypeWebApp/app.py`

Must not own:

- UI design.
- Payment provider UI.

### Subagent 4: Rendering, Export, and QA

Ownership:

- Porting TypoEffector into Next.js.
- WebGL preview.
- Effect presets.
- Cover composition.
- Basic PNG export.
- Advanced PNG/ZIP export foundation.
- Browser compatibility checks.
- End-to-end QA scripts where practical.

Must read:

- `docs/design/DESIGN.md`
- `TypoEffector/README.md`
- `TypoEffector/src/main.js`
- `TypoEffector/src/renderer.js`
- `TypoEffector/src/layer-effects.js`
- `TypoEffector/src/effects.js`

Must not own:

- Credit ledger rules.
- Python generation worker.

## Master Agent Responsibilities

- Keep release scope tight.
- Sequence subagent work.
- Prevent overlapping file ownership.
- Review all generated code.
- Integrate branches or patches.
- Ensure existing prototype behavior is preserved.
- Maintain project documentation.
- Decide when to defer work.
- Run final verification.

## Release 1 Plan: Core Typography Generation

### R1.1 Repository Structure

Create production app folders without deleting the prototype:

- `apps/web`
- `apps/api`
- `apps/worker`
- `packages/shared` if needed
- `supabase/migrations`

Keep existing prototype folders intact:

- `LayoutModule`
- `PromptGenerationModule`
- `ImageGenerationModule`
- `PrototypeWebApp`
- `TypoEffector`

### R1.2 Supabase Foundation

Create schema for:

- users profile mirror
- guest sessions
- projects
- project versions
- genres
- assets
- jobs
- generation batches
- generation slots

Implement RLS so users can read and write only their own records.

### R1.3 FastAPI Foundation

Create endpoints:

- `GET /health`
- `POST /projects`
- `GET /projects/:id`
- `POST /projects/:id/versions`
- `PATCH /versions/:id/layout`
- `PATCH /versions/:id/style-input`
- `POST /jobs/layout`
- `POST /jobs/style-resolution`
- `POST /jobs/typography-generation`
- `GET /jobs/:id`
- `GET /assets/:id/signed-url`

Credit charge can be stubbed in Release 1 if payment is deferred, but the API shape should leave space for it.

### R1.4 Worker Foundation

Implement:

- DB-backed job polling.
- Job claiming.
- Status transitions.
- Layout generation job using current LayoutModule.
- Style resolution job using current PromptGenerationModule.
- Typography generation job using current ImageGenerationModule.
- Slot-level result storage.

### R1.5 Next.js Workflow

Implement screens:

- Start/genre selection.
- Cover upload.
- Title input.
- Layout loading and editor.
- Style/elements input and resolved list.
- Login gate before generation.
- Generation confirmation.
- Generation waiting screen.
- Candidate selection.

Use browser local storage for guest draft fallback.

### R1.6 Verification

Verify:

- Existing layout item shape is preserved.
- Style resolution output remains compatible with Comfy prompt needs.
- A generation batch creates three slots.
- Partial failure can be represented in state.
- Candidate assets are private and retrievable by signed URL.

## Release 2 Plan: Effect Rendering and Export

### R2.1 TypoEffector Port

Port renderer logic into Next.js without rewriting shader behavior from scratch.

Preserve:

- Material presets.
- Mask extraction behavior.
- Glow/shadow composition.
- Transparent PNG output path.

### R2.2 Effect Screen

Implement:

- Cover preview.
- Auto typography placement from cover analysis.
- Recommended preset selection.
- Preset switching.
- Position/scale/rotation controls.
- Limited advanced controls.

### R2.3 Basic Export

Implement:

- Final composited PNG.
- Long edge around 2000 px.
- Transparent black typography PNG download.

### R2.4 Advanced Export Foundation

Implement:

- High-resolution PNG export.
- Layer-separated PNG export.
- ZIP packaging in browser.

Payment/credit enforcement can be connected in Release 3.

## Release 3 Plan: Credits, Payment, and Operations

### R3.1 Credit Ledger

Implement:

- Credit balances from ledger.
- Purchase entries.
- Generation charge entries.
- Export charge entries.
- Refund entries.
- Admin adjustment entries.
- One-year expiration for purchased credits.

### R3.2 Payment Provider

Implement one credit-pack purchase provider.

Requirements:

- Hosted payment flow if possible.
- Webhook verification.
- Idempotent payment handling.
- Credit grant after confirmed payment.

### R3.3 Refund Settlement

Implement:

- Slot-level refund calculation.
- Batch settlement.
- User-facing refund summary.
- Admin-visible refund reason.

### R3.4 Admin Minimum

Implement:

- User lookup.
- Credit ledger view.
- Manual credit adjustment.
- Failed job list.
- Job retry/force-fail action.
- Asset deletion check.

### R3.5 Retention and Cleanup

Implement:

- 30-day asset expiration.
- Cleanup job.
- Metadata retention.
- Deleted asset state.

## Implementation Order

1. Lock documentation.
2. Create production folder structure.
3. Add Supabase schema draft.
4. Add FastAPI health/auth foundation.
5. Add worker skeleton.
6. Add Next.js shell and route flow.
7. Connect layout generation.
8. Connect style resolution.
9. Connect Comfy generation.
10. Add candidate selection.
11. Port effect renderer.
12. Add basic export.
13. Add credits and payment.
14. Add admin and cleanup.

## Verification Strategy

Minimum checks:

- Unit tests for layout item serialization.
- Unit tests for prompt normalization.
- Unit tests for workflow patching.
- Integration test for job status transitions.
- Integration test for slot refund calculation.
- Browser test for editor interaction.
- Browser test for WebGL canvas nonblank rendering.
- Browser test for basic export file creation.

Manual checks:

- Full guest-to-login flow.
- Full generation flow with three successful candidates.
- Partial slot failure.
- Timeout path.
- Cover upload and signed URL display.
- Browser export on target desktop browsers.

## Deferred Decisions

- Final visual brand identity.
- Exact color palette.
- Exact export resolution tiers beyond basic 2000 px long edge.
- Payment provider selection.
- Legal wording.
- Advanced PSD/vector export.
- Team accounts.
- Server-side rendering.
