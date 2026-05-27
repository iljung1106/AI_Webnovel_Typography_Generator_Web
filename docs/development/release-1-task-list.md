# Release 1 Task List

Release 1 proves the production generation workflow without payment or advanced export.

## Phase 1: Foundation

- [x] Create service folders.
- [x] Add Next.js shell.
- [x] Add FastAPI shell.
- [x] Add worker shell.
- [x] Add Supabase migration.
- [x] Add shared contracts.
- [x] Document setup flow.

## Phase 2: Data and Auth

- Keep request and response shapes aligned with `docs/development/release-1-contracts.md`.
- [x] Replace `X-User-Id` development auth with Supabase JWT verification.
- [x] Add Supabase client wrapper in API.
- [x] Implement database-backed project creation.
- [x] Implement project version creation.
- [x] Implement asset records and signed URL flow.
- Add private Supabase Storage buckets.

## Phase 3: Layout Flow

- Add title input screen.
- Add layout job creation.
- [x] Add worker handler for `layout_generation`.
- [x] Reuse `LayoutModule.generate_items`.
- Store `layout_json` on project version.
- Render layout items in the web editor.
- Preserve move, resize, and rotate controls.

## Phase 4: Style Resolution

- Add elements/style input screen.
- [x] Add worker handler for `style_resolution`.
- [x] Reuse `PromptGenerationModule`.
- Present resolved prompt as editable element/style lists in UI.

## Phase 5: Candidate Generation

- Add generation confirmation screen.
- Add typography generation job.
- [x] Create one generation batch and three slots.
- Render edited layout to input PNG.
- [x] Reuse `ImageGenerationModule`.
- Store candidate images as private assets.
- Show generation waiting screen.
- Show partial failure and refund placeholders.

## Phase 6: Candidate Selection

- Show successful candidates.
- Allow one selected candidate.
- Store `selected_candidate_id`.
- Prepare handoff to Release 2 effect editor.

## Acceptance Criteria

- A user can create a project and version.
- The app can generate or load layout items using the existing module contract.
- The app can resolve style text using the existing prompt module.
- The app can request three Comfy Cloud candidates through the existing module.
- Candidate assets are represented in Supabase.
- Job and slot states can represent partial failure.
