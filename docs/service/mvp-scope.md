# MVP Scope

## Release Strategy

The MVP should be built as three releases. This keeps the project shippable while preserving the full production direction.

## Release 1: Core Typography Generation

Goal: A logged-in user can create a project, generate three typography candidates, and choose one.

Included:

- Next.js frontend shell.
- FastAPI backend.
- Python worker.
- Supabase Auth, Postgres, and Storage.
- Google login.
- Guest draft until paid generation step.
- Project and version creation.
- Genre selection.
- Optional cover upload and lightweight analysis.
- Title input.
- AI layout generation using the existing layout module.
- Letter-level layout editing.
- Element/style input.
- AI style resolution using the existing prompt module.
- Credit cost confirmation UI placeholder.
- Comfy Cloud candidate generation using the existing image generation module.
- Three-slot generation batch state.
- Slot-level failure and timeout handling.
- Candidate selection.
- Private asset storage with signed URLs.

Deferred from Release 1:

- Real payment provider integration.
- Full credit purchase flow.
- Advanced export.
- WebGL effect editor.
- Admin dashboard beyond minimal manual database inspection.

## Release 2: Effect Editor and Export

Goal: A user can place a chosen typography candidate on a cover, apply browser-rendered effects, and export usable files.

Included:

- TypoEffector logic ported into the Next.js app.
- Browser WebGL preview.
- Recommended default effect preset.
- Effect preset switching.
- Basic controls for position, scale, rotation, glow, shadow, and material preset.
- Basic export:
  - Final composited PNG.
  - Long edge around 2000 px.
  - Transparent black typography PNG.
- Advanced export foundation:
  - High-resolution final PNG.
  - Layer-separated PNG ZIP.
  - Client-side ZIP generation where feasible.

Deferred from Release 2:

- PSD export.
- Vector export.
- Server-side rendering.
- Heavy professional editing controls.

## Release 3: Payment, Credits, and Operations

Goal: The service can run as a paid MVP with reliable credit accounting and basic operations tooling.

Included:

- Credit pack purchase.
- One-year credit expiration.
- Generation credit charge.
- Advanced export credit charge.
- Slot-level proportional refund.
- Credit ledger.
- Payment provider webhook handling.
- Minimal admin dashboard:
  - User lookup.
  - Credit balance and ledger lookup.
  - Manual credit adjustment.
  - Failed job lookup.
  - Job retry or forced failure.
  - Asset deletion check.
- Asset expiration cleanup.
- Rate limits and concurrent generation limits.
- Terms, privacy policy, and refund policy drafts.

Deferred from Release 3:

- Subscriptions.
- Team billing.
- Workspace accounts.
- Long-term project storage.
- Designer retouch marketplace.

## Non-Goals for MVP

- The app does not generate cover illustrations.
- The app does not provide a general Canva-like design canvas.
- The app does not offer long-term archival storage.
- The app does not guarantee unique or exclusive typography output.
- The app does not promise legal clearance for user-provided titles, brands, or references.

## MVP Success Criteria

- A new user can understand the workflow without onboarding documentation.
- A user can finish a basic result in one guided session.
- Generation failures are visible, recoverable, and reflected in credits.
- Core layout, prompt, image-generation, and WebGL behavior stays the same as, or very close to, the current prototype unless a requirement explicitly changes it.
- The service can run at low fixed cost with Vercel Free, Supabase Free, and one low-cost Render service during early testing.
- The architecture can later split API and worker services without changing the product model.
