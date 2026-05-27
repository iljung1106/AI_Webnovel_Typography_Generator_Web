# Current Skeleton Status

## Created

- Root project README.
- Root `package.json` with frontend workspace scripts.
- Next.js app skeleton in `apps/web`.
- FastAPI app skeleton in `apps/api`.
- Python worker skeleton in `apps/worker`.
- Shared TypeScript contracts in `packages/shared`.
- Initial Supabase migration in `supabase/migrations`.
- Development docs in `docs/development`.
- Release 1 integration contracts in `docs/development/release-1-contracts.md`.
- Supabase job-claiming RPC migration in `supabase/migrations/0002_claim_next_job.sql`.
- Client-side frontend workflow shell with guest draft persistence.
- Supabase-backed API foundation for projects, versions, jobs, and signed asset URLs.
- Worker job registry and Supabase-backed polling/claiming foundation.

## Verified

- Python files compile with `python3 -m compileall apps/api apps/worker`.
- JSON files parse:
  - `package.json`
  - `apps/web/package.json`
  - `apps/web/tsconfig.json`
  - `packages/shared/package.json`
- Next.js frontend typecheck passes with `npm run typecheck:web`.
- Next.js production build passes with `npm run build:web`.
- API route import smoke check passes.
- Worker registry smoke check exposes:
  - `layout_generation`
  - `style_resolution`
  - `typography_generation`

## Not Yet Implemented

- Supabase Storage bucket creation scripts.
- Actual layout generation API integration.
- Actual style resolution API integration.
- Actual Comfy Cloud generation job handling.
- Payment and credit purchase flow.
- Release 2 effect editor port.
- End-to-end Supabase runtime verification against a real project.
- Frontend API calls for project/version/job creation.
- Login gate and Supabase Auth UI.

## Next Best Step

Connect the frontend workflow to the API for project/version creation and layout job creation. In parallel, apply Supabase migrations in a real project and verify that `claim_next_job` works with the worker using service-role credentials.
