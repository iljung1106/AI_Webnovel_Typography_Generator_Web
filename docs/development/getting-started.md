# Getting Started

This document explains the new service skeleton. It does not replace the prototype; it creates a production-oriented path beside it.

## Repository Layout

- `apps/web` Next.js frontend.
- `apps/api` FastAPI API service.
- `apps/worker` Python background worker.
- `packages/shared` shared TypeScript contracts.
- `supabase/migrations` database schema.
- Existing prototype modules remain in place and should be reused.

## Prerequisites

- Node.js 20 or newer.
- Python 3.10 or newer.
- Supabase project for Auth, Postgres, and Storage.
- OpenRouter API key.
- Comfy Cloud API key.

## Environment

Copy `.env.example` to `.env` and fill in:

- `OPENROUTER_API_KEY`
- `COMFY_CLOUD_API_KEY`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `ALLOW_DEV_AUTH`
- `USE_CLAIM_JOB_RPC`

## Frontend

From the repository root:

```bash
npm install
npm run dev:web
```

The web app is expected at `http://127.0.0.1:3000`.

## API

```bash
cd apps/api
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

## Worker

```bash
cd apps/worker
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m worker.main
```

The worker includes a database-backed polling path and a `claim_next_job` RPC path. Apply `supabase/migrations/0002_claim_next_job.sql` and keep `USE_CLAIM_JOB_RPC=true` for safer claiming.

## Supabase

Apply migrations from `supabase/migrations`.

The first migration creates:

- profiles
- guest sessions
- genres
- projects
- project versions
- assets
- jobs
- generation batches
- generation slots
- credit ledger
- purchases
- exports
- user consents

Storage buckets still need to be created in Supabase:

- `covers`
- `typography-inputs`
- `typography-results`
- `exports`

All buckets should be private.

## Development Auth Stub

The FastAPI skeleton currently uses an `X-User-Id` header to make user ownership explicit before Supabase JWT verification is implemented.

Replace this with Supabase JWT verification before a real beta.
