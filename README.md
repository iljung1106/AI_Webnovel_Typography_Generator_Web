# AI Webnovel Typography Generator

This repository contains the current typography-generation prototype and the new service skeleton for turning it into a production web app.

The production direction is documented under `docs/`. The core rule is simple: preserve the working prototype behavior and wrap it in a service architecture instead of rewriting the core logic from scratch.

## Current Prototype

- `LayoutModule/` generates Korean title layout items.
- `PromptGenerationModule/` turns title/style inputs into generation prompts.
- `ImageGenerationModule/` runs the fixed Comfy Cloud workflow.
- `PrototypeWebApp/` is the Flask prototype that connects the current modules.
- `TypoEffector/` is the browser WebGL material/effect prototype.

## Service Skeleton

- `apps/web/` Next.js frontend shell.
- `apps/api/` FastAPI API skeleton.
- `apps/worker/` Python worker skeleton.
- `packages/shared/` shared TypeScript contracts for the web app.
- `supabase/migrations/` initial database schema.
- `docs/development/` implementation and onboarding docs.

## Required Reading

- `docs/service/product-brief.md`
- `docs/service/mvp-scope.md`
- `docs/service/code-reuse-contract.md`
- `docs/service/implementation-plan.md`
- `docs/design/DESIGN.md`
- `docs/development/getting-started.md`

## Release Direction

Release 1 focuses on the end-to-end typography generation flow:

1. Genre selection.
2. Optional cover upload and analysis stub.
3. Title input.
4. AI layout generation.
5. Layout editing.
6. Style and element resolution.
7. Comfy Cloud generation of three candidates.
8. Candidate selection.

Payment, advanced export, and full WebGL effect editing are later releases.
