# Policy and Operations Checklist

## Account and Authentication

- Use Google login only for MVP.
- Do not implement password-based signup.
- Require login before any credit-consuming generation.
- Preserve guest draft state during login.
- Provide account deletion.
- Use the Google email for receipts and support contact by default.

## Billing and Credits

- Use credit pack purchases only.
- Do not implement subscriptions in MVP.
- Purchased credits expire after one year.
- Generation and advanced export each consume credits.
- One typography generation batch produces three candidate slots.
- Failed slots are refunded proportionally.
- Technical failure is refundable.
- User dissatisfaction is not refundable.
- Payment provider and refund policy need legal and accounting review before public launch.

## Data Handling

- Uploaded covers and generated images are short-lived.
- Default asset retention target is 30 days.
- Payment, credit, consent, and minimal job metadata are retained longer.
- User content is not used for model training.
- User content is not used for marketing examples or public showcases.
- Uploaded covers are not sent to OpenRouter or Comfy Cloud for generation.

## Privacy and Legal

Documents needed before launch:

- Terms of service.
- Privacy policy.
- Paid service and credit policy.
- Refund policy.
- AI output and commercial use notice.
- User content responsibility notice.

Legal review needed:

- Commercial-use license language.
- Limits of service responsibility.
- User responsibility for third-party IP infringement.
- Credit expiration and refund handling.
- Data processor and overseas transfer disclosures if required.

## Generation Safety

MVP safety should be lightweight and prompt-driven.

Minimum controls:

- Prompt generation should avoid explicit sexual, hateful, or illegal content.
- Prompt generation should avoid instructions that imitate protected brands or living artists too directly.
- Terms should prohibit infringing or unlawful inputs.
- Admin should be able to disable abusive users manually.

## Cost Controls

Initial controls:

- One active generation batch per user.
- Batch timeout.
- Slot-level timeout.
- Daily generation cap per user if needed.
- Disable generation globally during Comfy Cloud outage.
- Admin credit adjustment.
- Store generated assets with expiration.
- Avoid server-side rendering in MVP.

## Admin MVP

Minimum admin functions:

- Look up user by email.
- View credit balance.
- View credit ledger.
- Adjust credits manually.
- View projects and jobs.
- View failed jobs.
- Mark jobs as failed if stuck.
- Retry jobs where safe.
- Check asset expiration and deletion state.

Admin can be a simple protected internal page or script in MVP. It does not need a polished UI at first.

## Monitoring

Track:

- Generation batch count.
- Slot success rate.
- Slot failure reason.
- Average generation time.
- Timeout rate.
- Comfy Cloud error rate.
- OpenRouter error rate.
- Credit refunds.
- Export failure rate.
- Storage usage.

Recommended tools:

- Render logs for API and worker.
- Supabase logs for DB/storage/auth.
- Sentry or equivalent for frontend/backend errors once beta users exist.

## Launch Readiness

Before private beta:

- Google login works.
- Guest draft survives login.
- Credits can be manually granted.
- One full generation batch works.
- Failed slots are visible and refundable.
- Assets are private.
- Signed URLs work.
- Browser export works on target desktop browsers.
- User content non-use policy is visible.

Before paid public launch:

- Payment provider integrated.
- Webhooks verified.
- Credit ledger tested.
- Refund paths tested.
- Policy pages published.
- Legal review completed for core terms.
- Admin credit adjustment available.
- Asset cleanup job running.
