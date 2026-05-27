# Data Model and State Machines

## Concept Model

The service is project-centered.

- A `Project` represents one title typography production space.
- A `ProjectVersion` represents one attempt or direction inside a project.
- A `GenerationBatch` represents one paid request for three typography candidates.
- A `GenerationSlot` represents one candidate inside a batch.
- An `Asset` represents a stored file.
- A `Job` represents asynchronous work.
- A `CreditLedger` row records every credit movement.

MVP uses personal accounts only. There is no workspace or team model.

## Tables

### users

Supabase Auth is the source of identity. A local profile table may mirror user metadata.

- `id`
- `google_sub`
- `email`
- `display_name`
- `avatar_url`
- `created_at`
- `deleted_at`

### guest_sessions

Temporary draft state before login.

- `id`
- `anonymous_id`
- `draft_payload`
- `expires_at`
- `claimed_by_user_id`
- `created_at`

Guest sessions should expire quickly, such as after 24 hours.

### projects

- `id`
- `user_id`
- `title`
- `status`
- `selected_genre_id`
- `expires_at`
- `created_at`
- `updated_at`

Statuses:

- `draft`
- `active`
- `expired`
- `deleted`

### project_versions

- `id`
- `project_id`
- `version_number`
- `genre_id`
- `title_text`
- `cover_asset_id`
- `layout_json`
- `style_input_json`
- `style_resolved_json`
- `selected_candidate_id`
- `effect_settings_json`
- `cover_placement_json`
- `created_at`

The UI does not need to expose the word "version" in MVP. It can use language such as "new attempt" or "previous recommendation."

### genres

- `id`
- `name`
- `slug`
- `description`
- `example_asset_id`
- `default_style_hints_json`
- `is_active`

### assets

- `id`
- `user_id`
- `project_id`
- `version_id`
- `type`
- `storage_bucket`
- `storage_path`
- `mime_type`
- `width`
- `height`
- `size_bytes`
- `expires_at`
- `created_at`
- `deleted_at`

Asset types:

- `cover`
- `layout_png`
- `candidate`
- `transparent_bw`
- `final_export`
- `advanced_png`
- `layer_zip`

### jobs

- `id`
- `user_id`
- `project_id`
- `version_id`
- `type`
- `status`
- `input_json`
- `result_json`
- `error_code`
- `error_message`
- `timeout_at`
- `started_at`
- `finished_at`
- `created_at`

Job types:

- `cover_analysis`
- `layout_generation`
- `style_resolution`
- `typography_generation`
- `export`
- `asset_cleanup`

Job statuses:

- `queued`
- `running`
- `succeeded`
- `partially_succeeded`
- `failed`
- `timed_out`
- `cancelled`

### generation_batches

- `id`
- `user_id`
- `project_id`
- `version_id`
- `job_id`
- `credit_cost_total`
- `credit_refunded_total`
- `status`
- `created_at`
- `finished_at`

Batch statuses:

- `created`
- `charged`
- `running`
- `partially_succeeded`
- `succeeded`
- `failed`
- `timed_out`
- `settled`

### generation_slots

- `id`
- `batch_id`
- `slot_index`
- `seed`
- `status`
- `comfy_prompt_id`
- `candidate_asset_id`
- `transparent_asset_id`
- `error_code`
- `credit_cost`
- `credit_refunded`
- `started_at`
- `finished_at`

Slot statuses:

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

### credit_ledger

- `id`
- `user_id`
- `type`
- `amount`
- `balance_after`
- `related_project_id`
- `related_batch_id`
- `related_export_job_id`
- `expires_at`
- `memo`
- `created_at`

Ledger types:

- `purchase`
- `generation_charge`
- `export_charge`
- `refund`
- `admin_adjustment`
- `free_grant`

Credit expiration:

- Purchased credits expire one year after purchase.
- Free grants may use a shorter expiration if needed.

### credit_purchases

- `id`
- `user_id`
- `provider`
- `provider_payment_id`
- `status`
- `amount_paid`
- `currency`
- `credits_granted`
- `created_at`

### exports

- `id`
- `user_id`
- `project_id`
- `version_id`
- `candidate_id`
- `type`
- `job_id`
- `asset_id`
- `credit_cost`
- `status`
- `created_at`

Export types:

- `basic_png`
- `advanced_png`
- `layer_zip`

Export statuses:

- `draft`
- `ready_to_export`
- `charging`
- `rendering_in_browser`
- `uploading`
- `succeeded`
- `failed`
- `refunded`

### user_consents

- `id`
- `user_id`
- `terms_version`
- `privacy_version`
- `marketing_opt_in`
- `created_at`

## State Rules

### Generation Batch

1. API creates `GenerationBatch` and three `GenerationSlot` rows.
2. API checks credits.
3. API writes a `generation_charge` ledger entry.
4. Batch becomes `charged`.
5. Worker runs each slot.
6. Each slot reaches a terminal success or failure state.
7. Failed, timed-out, or postprocess-failed slots are refunded proportionally.
8. Batch becomes:
   - `succeeded` if all three slots succeed.
   - `partially_succeeded` if at least one succeeds and at least one fails.
   - `failed` if no slots succeed.
   - `timed_out` if timeout rules end the batch.
9. Batch becomes `settled` after all refunds are recorded.

### Refund Rule

Refunds are slot-based.

If a three-slot batch costs one generation unit, each slot has one third of the batch cost for refund accounting. If the product later uses indivisible credits, the ledger can record fractional internal units while the UI displays rounded values or "partial credit."

Refundable failures:

- Comfy Cloud error.
- No image produced.
- Download failure.
- Black-to-transparent postprocess failure.
- Timeout.

Not refundable:

- User dislikes the result.
- User entered the wrong title.
- User changed their mind after successful generation.

### Asset Expiration

Short-lived assets:

- Uploaded cover.
- Layout PNG.
- Candidate images.
- Transparent black typography PNG.
- Basic final export.
- Advanced export ZIP.

Default expiration target: 30 days.

Longer-lived records:

- Payment records.
- Credit ledger.
- Minimal job metadata.
- User consent records.

Images may be deleted while metadata remains for accounting and support.

### Concurrency Rule

MVP should allow only one active typography generation batch per user.

This controls cost, reduces duplicate queue load, and simplifies user messaging.
