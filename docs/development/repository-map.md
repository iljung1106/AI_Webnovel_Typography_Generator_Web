# Repository Map

## Existing Prototype Code

### `LayoutModule`

Generates Korean title layout data. Preserve the item contract:

- `char`
- `x`
- `y`
- `fs`
- `rotation`

### `PromptGenerationModule`

Builds and normalizes typography prompts through OpenRouter.

### `ImageGenerationModule`

Uploads layout images to Comfy Cloud, patches the fixed workflow, submits jobs, polls results, and downloads images.

### `PrototypeWebApp`

Flask proof of concept for the existing end-to-end flow.

### `TypoEffector`

Static WebGL prototype for material/effect rendering and transparent PNG export.

## New Service Code

### `apps/web`

Next.js app for the user-facing workflow.

Initial screen is a design-system-aligned genre selection skeleton.

### `apps/api`

FastAPI skeleton for authenticated service operations.

Initial routes:

- `GET /health`
- `POST /projects`
- `GET /projects/{project_id}`
- `POST /projects/{project_id}/versions`
- `PATCH /projects/{project_id}/versions/{version_id}`
- `POST /jobs`
- `GET /jobs/{job_id}`
- `GET /assets/{asset_id}/signed-url`

### `apps/worker`

Python worker skeleton.

Includes adapters that import existing prototype modules instead of rewriting them.

### `packages/shared`

Shared TypeScript contracts for workflow steps, jobs, generation slots, and layout items.

### `supabase/migrations`

Database schema and RLS policies.

## Important Boundary

Do not delete or rewrite the prototype while building the production skeleton. Production code should wrap or port the prototype behavior in controlled steps.
