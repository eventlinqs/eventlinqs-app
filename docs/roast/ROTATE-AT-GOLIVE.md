# Rotate at go-live

Credentials that must be rotated before or at go-live, by VARIABLE NAME only.
No value appears in this file, and none should ever be added to it.

Compiled 12 August 2026 on `integration/launch`. The operating procedure for a
rotation lives in `docs/security/CREDENTIAL-ROTATION.md`; this file is the list,
not the method.

**Why a list rather than an edit.** Several of these are in git history. Removing
a secret from the working tree does not un-expose it, because the old commit still
carries it, and history rewriting is banned on this project until the founder
authorises the runbook at `docs/roast/AUTHORSHIP-HISTORY-REWRITE.md`. Rotation is
therefore the only action that actually revokes them.

| Variable | Scope | Why it is on this list |
|---|---|---|
| `EL_DRIVE_PASSWORD` | TEST | The drive and gate organiser account. Sat as a literal in `scripts/verify/waitlist-bridge-e2e.mjs` and in clear text in two committed COMMENTS (`src/lib/hooks/use-hydrated.ts`, `tests/unit/auth/no-native-submit.test.ts`). All three are cleaned as of 12 August 2026, and all three remain in history. |
| `EL_CONNECT_PROOF_PASSWORD` | TEST | The Connect prefill proof account. Sat as a literal in `scripts/verify/connect-prefill-fixture.mjs`, now read from the environment and failing closed. Remains in history. |
| `SUPABASE_ACCESS_TOKEN` | Repository secret, management API | Expires repeatedly and gates the CI types-drift job. Rotate on a known date rather than discovering it expired through a red gate. |
| `CRON_SECRET` | Production | Founder-reported as holding 28 characters against its own declared 32 minimum for production. A secret below its declared floor is a policy breach whether or not it has leaked, so it is rotated to a compliant length rather than merely lengthened in the manifest. |
| `STRIPE_SECRET_KEY` | TEST and Production, separately | Money path. Rotate both scopes, never reusing a value across them. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | TEST and Production, separately | Publishable, so not secret, but it is paired to the secret key by account and must be re-paired in the same pass or the pairing guard will fail. |
| `STRIPE_WEBHOOK_SECRET` | TEST and Production, separately | Signing secret for the webhook endpoint. |
| `STRIPE_WEBHOOK_SECRETS` | TEST and Production, separately | The multi-secret list the webhook tries in turn during a rotation. It exists so a rotation can overlap; it must be pruned back after, or an old secret stays valid indefinitely. |
| `VERCEL_TOKEN` | Deployment | Not currently set in this worktree, which is why `preview-deployment-state` reports SKIP rather than PASS. Mint it fresh at go-live rather than reusing an older token of unknown exposure. |

## Order

1. `CRON_SECRET`, because it is a known policy breach rather than a precaution.
2. The Stripe set, together, so the key pairing and the webhook signature never
   disagree with each other mid-rotation.
3. `SUPABASE_ACCESS_TOKEN` and `VERCEL_TOKEN`, which gate tooling rather than
   money and can move without a customer-facing window.
4. The two TEST fixture passwords last. They open nothing in production, and
   rotating them means updating the exported variables the drive scripts read.

## Not on this list, and why

The Supabase anon and service-role keys and the project URLs are not here as a
leak response: they have not been found in the working tree in clear text. They
belong to the ordinary go-live posture check instead, which is a separate
question from revoking something already exposed.
