# Release 1 Integration Contracts

This document is the integration reference between the frontend, API, and worker during Release 1. It intentionally stays close to the existing prototype data shapes.

## Auth Boundary

Frontend sends a Supabase access token to the API:

```http
Authorization: Bearer <supabase-access-token>
```

Temporary development fallback may use:

```http
X-User-Id: <uuid>
```

Production beta must use Supabase JWT verification.

## Layout Item Contract

Layout items preserve the existing `LayoutModule` shape:

```json
{
  "char": "가",
  "x": 100.0,
  "y": 300.0,
  "fs": 180,
  "rotation": 0.0
}
```

Rules:

- `char` is one displayed glyph.
- `x` is the left edge.
- `y` is the bottom edge.
- `fs` is the square glyph size in pixels.
- `rotation` is degrees.

Frontend editors, API storage, worker handlers, and PNG rendering must preserve this shape.

## Project Flow

### Create Project

```http
POST /projects
```

Request:

```json
{
  "title": "외신에게 집착받는 천재 마법사가 되었다",
  "selected_genre_id": "uuid-or-null"
}
```

Response:

```json
{
  "id": "uuid",
  "title": "외신에게 집착받는 천재 마법사가 되었다",
  "status": "draft",
  "selected_genre_id": "uuid-or-null",
  "created_at": "timestamp-or-null"
}
```

### Create Version

```http
POST /projects/{project_id}/versions
```

Request:

```json
{
  "title_text": "외신에게 집착받는 천재 마법사가 되었다",
  "genre_id": "uuid-or-null",
  "cover_asset_id": "uuid-or-null"
}
```

Response minimum:

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "title_text": "외신에게 집착받는 천재 마법사가 되었다"
}
```

## Job Flow

### Create Job

```http
POST /jobs
```

Request:

```json
{
  "project_id": "uuid",
  "version_id": "uuid",
  "type": "layout_generation",
  "input_json": {
    "title": "외신에게 집착받는 천재 마법사가 되었다"
  }
}
```

Job types:

- `cover_analysis`
- `layout_generation`
- `style_resolution`
- `typography_generation`
- `export`

Response:

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "version_id": "uuid",
  "type": "layout_generation",
  "status": "queued",
  "result_json": {},
  "error_code": null,
  "error_message": null
}
```

### Poll Job

```http
GET /jobs/{job_id}
```

The frontend can poll this route until a terminal state.

Terminal states:

- `succeeded`
- `partially_succeeded`
- `failed`
- `timed_out`
- `cancelled`

## Job Result Shapes

### layout_generation

Successful `result_json`:

```json
{
  "items": [
    {
      "char": "외",
      "x": 122.0,
      "y": 450.0,
      "fs": 180,
      "rotation": 0.0
    }
  ],
  "canvas": {
    "width": 2000,
    "height": 1000
  }
}
```

Also store the same items in `project_versions.layout_json`.

### style_resolution

Successful `result_json`:

```json
{
  "prompt": "Transform this plain Korean text...",
  "display": {
    "elements": ["왕관", "리본", "보석"],
    "style": ["우아한 세리프", "섬세한 장식"]
  }
}
```

`display` is user-facing and may be derived from the prompt. The internal prompt must remain compatible with the existing Comfy workflow.

### typography_generation

Successful or partially successful `result_json`:

```json
{
  "batch_id": "uuid",
  "slots": [
    {
      "slot_index": 1,
      "status": "succeeded",
      "candidate_asset_id": "uuid",
      "transparent_asset_id": "uuid-or-null",
      "credit_refunded": 0
    }
  ]
}
```

The frontend should render each slot independently.

## Generation Slot States

Slot states:

- `queued`
- `uploading_input`
- `submitted_to_comfy`
- `running`
- `image_downloaded`
- `postprocessing`
- `succeeded`
- `comfy_failed`
- `download_failed`
- `postprocess_failed`
- `timed_out`
- `refunded`

Refundable terminal failures:

- `comfy_failed`
- `download_failed`
- `postprocess_failed`
- `timed_out`

## Worker Claiming

Preferred worker flow:

1. Claim one queued job atomically.
2. Mark it `running`.
3. Process with existing prototype modules.
4. Update `result_json` and terminal status.

If PostgREST cannot claim jobs safely with a simple query, add a SQL RPC function in a migration:

```sql
claim_next_job(worker_id text, supported_types text[])
```

The function should return one job row and set it to `running` in the same transaction.

## Asset Access

Assets are private. The frontend should request signed URLs:

```http
GET /assets/{asset_id}/signed-url
```

Response:

```json
{
  "asset_id": "uuid",
  "url": "https://...",
  "expires_in": 300
}
```

## Frontend Draft

Before login, frontend draft state should include:

```json
{
  "genreSlug": "romance-fantasy",
  "title": "작품 제목",
  "coverLocalName": "cover.png",
  "layoutItems": [],
  "styleInput": {
    "elements": [],
    "keywords": []
  }
}
```

Store locally first. When the user logs in before paid generation, create project/version records and attach the draft to the authenticated user.
