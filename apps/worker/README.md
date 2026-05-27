# Worker

Python background worker for long-running AI typography jobs.

## Owns

- Job claiming.
- Layout generation through `LayoutModule`.
- Style resolution through `PromptGenerationModule`.
- Candidate generation through `ImageGenerationModule`.
- Slot-level status, timeout, and refund settlement.

## Current State

The worker now has:

- A DB-backed polling loop for queued Supabase `jobs`.
- A guarded REST claim path:
  1. select the oldest queued supported job;
  2. `PATCH` the row to `running` only when `status=queued`;
  3. process the job through the registered handler;
  4. write `result_json`, terminal status, and error fields.
- A handler registry for:
  - `layout_generation`
  - `style_resolution`
  - `typography_generation`
- Prototype adapter calls for the existing modules rather than rewritten algorithms.

This guarded REST claim is safe against two workers completing the same row because only one conditional `PATCH ... status=eq.queued` can return the claimed row. It does not provide full database-side job prioritization, lease expiry, or skip-locked behavior.

## Job Inputs

### `layout_generation`

Required `input_json`:

```json
{
  "title": "외신에게 집착받는 천재 마법사가 되었다"
}
```

Behavior:

- Calls `LayoutModule.typography_layout.generate_items` through `worker.prototype_adapters`.
- Writes the Release 1 result shape to `jobs.result_json`.
- Writes the same layout payload to `project_versions.layout_json` when `version_id` is present.

### `style_resolution`

Required `input_json`:

```json
{
  "title": "외신에게 집착받는 천재 마법사가 되었다",
  "keywords": ["dark fantasy", "ornate"],
  "required_elements": ["crown", "ribbon"],
  "extra_instructions": "",
  "keep_original_text_visible": true
}
```

Behavior:

- Calls `PromptGenerationModule.prompt_generator.TypographyPromptGenerator` through `worker.prototype_adapters`.
- Writes `{ "prompt": "...", "display": { "elements": [...], "style": [...] } }` to `jobs.result_json`.
- Mirrors input and resolved prompt data to `project_versions.style_input_json` and `project_versions.style_resolved_json`.

### `typography_generation`

Required `input_json`:

```json
{
  "title": "외신에게 집착받는 천재 마법사가 되었다",
  "prompt": "Transform this plain Korean text...",
  "input_image_path": "/absolute/path/to/edited_layout.png",
  "sample_count": 3,
  "seeds": [123, 456, 789]
}
```

Behavior:

- Ensures a `generation_batches` row exists for the job.
- Ensures three `generation_slots` rows exist.
- Calls `ImageGenerationModule.typography_image_generator.TypographyImageGenerator` through `worker.prototype_adapters`.
- Uploads downloaded candidate files to the private `typography-results` bucket by default.
- Creates `assets` rows of type `candidate`.
- Updates each slot with status, seed, Comfy prompt id, and candidate asset id.
- Marks the job `succeeded`, `partially_succeeded`, or `failed` from slot outcomes.

Set `UPLOAD_GENERATED_ASSETS=0` for local development when you want asset rows created without uploading files to Supabase Storage. In that mode, `storage_bucket` and `storage_path` still point at the intended private object location.

## Environment

Required for DB-backed polling:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `JOB_POLL_INTERVAL_SECONDS`
- `SUPABASE_REQUEST_TIMEOUT_SECONDS`
- `WORKER_ID`
- `WORKER_OUTPUT_DIR`
- `TYPOGRAPHY_RESULTS_BUCKET`
- `UPLOAD_GENERATED_ASSETS`
- `USE_CLAIM_JOB_RPC`
- `CLAIM_JOB_RPC_NAME`

Prototype module calls still require their own provider keys:

- `OPENROUTER_API_KEY` for layout and prompt generation.
- `COMFY_CLOUD_API_KEY` for candidate generation.

## Optional Atomic Claim RPC

No migration was added by this worker pass. For higher concurrency, add a SQL function in a backend-owned migration and run the worker with `USE_CLAIM_JOB_RPC=1`.

Required function behavior:

```sql
claim_next_job(worker_id text, supported_types text[])
```

The function should:

1. Find the oldest `jobs` row where `status = 'queued'` and `type = any(supported_types)`.
2. Lock it with transaction-safe behavior such as `for update skip locked`.
3. Set:
   - `status = 'running'`
   - `started_at = now()`
   - `error_code = null`
   - `error_message = null`
4. Return the full updated job row with the same columns exposed by `public.jobs`.
5. Return zero rows when no job can be claimed.

If lease/heartbeat recovery is added later, the function should also reclaim stale `running` jobs whose worker lease has expired. The current schema has no worker id or lease columns, so that would need table support before implementation.

## Local Run

```bash
cd apps/worker
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m worker.main
```
