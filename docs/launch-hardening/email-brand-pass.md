# Transactional email brand pass

Every transactional email now uses the brand navy `#0A1628`. The old off-brand
`#1A1A2E` navy and the `#4A90D9` electric-blue links are gone, so the emails
read as one brand.

## Changed

| Email | File | Before | After |
|---|---|---|---|
| Confirm signup | `src/lib/email/templates/auth/confirm-signup.html` | `#1A1A2E` + `#4A90D9` | `#0A1628` |
| Password reset | `src/lib/email/templates/auth/password-reset.html` | `#1A1A2E` + `#4A90D9` | `#0A1628` |
| Magic link | `src/lib/email/templates/auth/magic-link.html` | `#1A1A2E` + `#4A90D9` | `#0A1628` |
| Reauthentication | `src/lib/email/templates/auth/reauthentication.html` | `#1A1A2E` + `#4A90D9` | `#0A1628` |
| Email change | `src/lib/email/templates/auth/email-change.html` | `#1A1A2E` + `#4A90D9` | `#0A1628` |
| Stripe purchase / ticket email | `src/app/api/webhooks/stripe/route.ts` | `#1A1A2E` x10 + `#4A90D9` x3 | `#0A1628` |
| Waitlist promotion | `src/lib/waitlist/promote.ts` | `#1A1A2E` x3 + a headline emoji | `#0A1628`, no emoji |
| Refund confirmation | `src/lib/email/templates/refund-confirmation.ts` | already `#0A1628` | unchanged (reference) |

Also: the card shadow `rgba(26,26,46,...)` (old navy) was mapped to
`rgba(10,22,40,...)`, and the waitlist headline emoji was removed so headlines
are emoji-free across every email (consistent with the others).

## Consistency

All emails now share: brand navy `#0A1628` for headings, body, wordmark, and the
primary button; underlined navy links; `#6B7280` for secondary text; the system
font stack; the 560 to 680px white card on `#FAFAFA`; and the tagline "Every
community. Every event. One platform." Australian English, no em-dashes or
en-dashes, no headline emoji.

## Render proof

`node scripts/email-brand-preview.mjs` renders the five Supabase auth HTML
templates (the ones that render directly in a browser) with sample data and
screenshots them to `qa/email-previews/`. Confirmed on-brand: navy wordmark,
navy CTA button, navy underlined link, grey footer.

The refund, waitlist, and Stripe purchase emails are built in TypeScript and
were brought to the same `#0A1628` palette in this pass (verified by the colour
audit: zero `#1A1A2E` / `#4A90D9` remain in any email source). They share the
same card layout and font stack.

## Deployment note

The five auth templates are Supabase Auth paste targets (Dashboard,
Authentication, Email Templates). After this change, re-paste each updated HTML
into the corresponding Supabase template so live auth emails pick up the brand
colour. The Stripe and waitlist emails are sent in-code via Resend and update
automatically on deploy.
