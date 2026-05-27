# Subagent Work Orders

These are the initial work orders for future parallel implementation. The master agent should only start subagents after the API contracts and folder boundaries are stable.

## Subagent 1: Frontend Workflow

Owned paths:

- `apps/web`
- `packages/shared` only for frontend type needs

Read first:

- `docs/design/DESIGN.md`
- `docs/service/product-brief.md`
- `docs/service/mvp-scope.md`
- `docs/development/repository-map.md`

Tasks:

- Build the step shell.
- Implement guest draft state.
- Add genre, cover, title, layout, style, generation, candidate screens.
- Keep UI aligned with `DESIGN.md`.

Do not edit:

- `apps/api`
- `apps/worker`
- `supabase/migrations`
- prototype modules

## Subagent 2: Backend API and Data

Owned paths:

- `apps/api`
- `supabase/migrations`

Read first:

- `docs/service/data-model-and-state.md`
- `docs/service/architecture.md`
- `docs/development/release-1-task-list.md`

Tasks:

- Implement Supabase client.
- Verify JWTs.
- Replace skeleton route responses with database-backed responses.
- Implement project, version, job, asset APIs.
- Keep RLS policies aligned with user-owned records.

Do not edit:

- `apps/web`
- `apps/worker`
- `TypoEffector`

## Subagent 3: AI Worker and Prototype Module Port

Owned paths:

- `apps/worker`
- small integration patches in existing prototype modules only when unavoidable

Read first:

- `docs/service/code-reuse-contract.md`
- `LayoutModule/typography_layout.py`
- `PromptGenerationModule/prompt_generator.py`
- `ImageGenerationModule/typography_image_generator.py`
- `ImageGenerationModule/comfy_cloud.py`
- `PrototypeWebApp/app.py`

Tasks:

- Implement database-backed job polling.
- Add job handlers.
- Wrap existing layout, prompt, and Comfy modules.
- Store job and slot results.
- Implement timeout and partial failure handling.

Do not edit:

- `apps/web`
- `supabase/migrations` unless coordinated with backend owner

## Subagent 4: Rendering, Export, and QA

Owned paths:

- future `apps/web` effect/export modules
- tests or QA scripts related to browser rendering
- TypoEffector porting notes

Read first:

- `docs/design/DESIGN.md`
- `TypoEffector/README.md`
- `TypoEffector/src/main.js`
- `TypoEffector/src/renderer.js`
- `TypoEffector/src/layer-effects.js`
- `TypoEffector/src/effects.js`

Tasks:

- Plan and port the WebGL renderer into Next.js.
- Verify canvas rendering is nonblank.
- Add basic PNG export checks.
- Add advanced ZIP export foundation later.

Do not edit:

- credit ledger internals
- Python worker generation handlers
