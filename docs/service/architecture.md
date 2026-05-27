# Service Architecture

## Overview

The production service should separate the user-facing web app from Python AI orchestration. The current Flask prototype is useful as a reference, but the service architecture should use:

- Next.js frontend.
- FastAPI backend.
- Python background worker.
- Supabase Auth, Postgres, and Storage.
- OpenRouter for layout and style text generation.
- Comfy Cloud for typography image generation.
- Browser WebGL for effect rendering and export.

## Runtime Components

### Web App

Technology: Next.js.

Responsibilities:

- Render the guided production workflow.
- Handle Google login through Supabase Auth.
- Preserve guest draft state before login.
- Upload cover files through signed upload flow.
- Provide layout editing UI.
- Show job progress.
- Show candidate selection UI.
- Run WebGL effect preview and browser export.
- Upload generated export files when needed.

### API Server

Technology: FastAPI.

Responsibilities:

- Validate authenticated user requests.
- Create and update projects and versions.
- Create jobs.
- Enforce credit checks and operation rules.
- Generate signed URLs or signed upload targets.
- Expose job status to the web app.
- Handle payment webhooks in Release 3.
- Keep provider API keys off the frontend.

### Worker

Technology: Python process.

Responsibilities:

- Poll or claim queued jobs from the database.
- Run OpenRouter layout generation through existing LayoutModule logic.
- Run OpenRouter style resolution through existing PromptGenerationModule logic.
- Submit Comfy Cloud generation jobs through existing ImageGenerationModule logic.
- Poll Comfy Cloud status.
- Download and store candidate assets.
- Run black-to-transparent post-processing.
- Apply timeout rules.
- Apply slot-level refund rules.
- Mark jobs as succeeded, partially succeeded, failed, or timed out.

### Database and Storage

Technology: Supabase.

Responsibilities:

- Google OAuth-backed user identity.
- Postgres database for projects, versions, jobs, batches, slots, assets, and credits.
- Private Storage buckets for uploaded covers and generated assets.
- Row-level security for user-owned records.
- Signed URL access for private assets.

## Deployment Plan

Early testing:

- Vercel Free for Next.js.
- Supabase Free for Auth, Postgres, and Storage.
- Render Starter service for API and worker together if needed.
- Comfy Cloud and OpenRouter billed by usage.

Production MVP:

- Vercel Pro if commercial traffic requires it.
- Supabase Pro for production stability and backups.
- Render API web service.
- Render background worker.

The API and worker can start as one deployable service to reduce cost, but their code boundaries should remain separate.

## Job Queue Strategy

MVP can use the `jobs` table as a simple queue:

- API creates a job with `queued` status.
- Worker claims queued jobs.
- Worker marks jobs `running`.
- Worker periodically updates progress in `result_json`.
- Worker marks terminal status.

This avoids Redis or Celery for the first version. If throughput grows, the worker can move to Redis/RQ, Celery, or another managed queue.

## Browser Rendering Strategy

Effect rendering and export should be browser-first.

Browser responsibilities:

- Load the selected transparent typography image.
- Load the cover preview image.
- Apply WebGL material effects.
- Composite cover, typography, glow, and shadow.
- Export basic PNG.
- Export advanced PNG and layer PNG ZIP where possible.

Constraints:

- Use image-mask-based typography for final effect rendering to avoid browser font differences.
- Set export resolution limits to avoid GPU memory failures.
- Provide a fallback message for browsers without WebGL2.
- Configure storage CORS so signed images can be used safely in canvas export.
- Do not rely on server-side rendering for visual exports in MVP.

## Existing Code Reuse

Production implementation must preserve the behavior and performance profile of existing working modules wherever possible. The new architecture should wrap, port, or adapt the current code rather than replacing it with newly invented logic.

Reuse:

- `LayoutModule/typography_layout.py` for AI layout generation and SVG/item handling.
- `PromptGenerationModule/prompt_generator.py` for style and element prompt resolution.
- `ImageGenerationModule/typography_image_generator.py` and `comfy_cloud.py` for Comfy Cloud batch generation.
- `TypoEffector/src/*` as the basis for browser material/effect rendering.

Keep as reference:

- `PrototypeWebApp/app.py`.
- `PrototypeWebApp/static/app.js`.
- `PrototypeWebApp/templates/index.html`.

Detailed reuse rules are defined in `docs/service/code-reuse-contract.md`.

## Security Boundaries

- Provider API keys must live only in server/worker environment variables.
- Supabase service role key must never be exposed to the browser.
- Frontend should use Supabase anon key with row-level security.
- Private assets should be accessed only through signed URLs.
- Payment webhooks must verify provider signatures.
- Logs must not include API keys, payment secrets, or raw sensitive user content beyond operational need.
