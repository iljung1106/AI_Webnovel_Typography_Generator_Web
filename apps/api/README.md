# API Service

FastAPI service for authenticated project, job, asset, and credit operations.

## Owns

- Auth verification.
- Project and version API.
- Job creation and status API.
- Asset signed URL API.
- Credit and payment APIs in Release 3.

## Current State

The Release 1 foundation uses Supabase-backed handlers for projects, project versions, jobs, and private asset signed URLs. Production requests should send:

```http
Authorization: Bearer <supabase-access-token>
```

`X-User-Id` is still available only when `ALLOW_DEV_AUTH=true` for local development. DB-backed routes require that user id to already exist in Supabase Auth/profile records because project rows reference `profiles`.

## Environment

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` for token verification through Supabase Auth
- `SUPABASE_SERVICE_ROLE_KEY` for server-side PostgREST and Storage calls
- `SUPABASE_STORAGE_BUCKET`, defaults to `project-assets`
- `SIGNED_URL_EXPIRES_IN`, defaults to `300`
- `ALLOW_DEV_AUTH`, defaults to true outside production
- `ALLOWED_ORIGINS`, comma-separated frontend origins

## Local Run

```bash
cd apps/api
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
