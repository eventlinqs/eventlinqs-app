# ENV-DOCTRINE: the environment and secret contract

**Status: AUTHORITY.** This document and the machinery it describes are binding.
Where any other document disagrees with this one or with the manifest, this one
and the manifest win, and the other document is stale until reconciled.

Last full audit: 2026-08-03.

---

## 0. The one rule that makes the rest work

**The manifest and the guards are the authority. Every document is a snapshot.**

`src/lib/env/manifest.mjs` is the single source of truth for every environment
variable this platform reads. `docs/verification/ENV-STATE.md` is GENERATED from
it and from the live stores, and it is a photograph of one moment. If the
snapshot and the manifest disagree, the snapshot is out of date. Regenerate it,
never hand-edit it:

```bash
node scripts/generate-env-state.mjs
```

A document that records the truth about configuration goes stale the moment
somebody edits a dashboard, and a stale document that still reads as current is
worse than no document. That is why the authority is executable.

---

## 1. Why this exists

Every environment failure this platform has suffered was invisible to the
pipeline, because not one of them was a MISSING variable:

| What happened | Why nothing caught it |
|---|---|
| An empty `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Present, so presence checks passed. Every map silently rendered its fallback with no error anywhere. |
| Preview holding a PRODUCTION service-role key | Correctly shaped, correctly present. Preview code could read and write the live database past row level security. |
| A publishable key from one Stripe account beside a secret key from another | Both keys valid. The payment element rendered nothing, with no console error and no network error. |
| Production running `sk_test_` while holding a LIVE webhook secret | Both present and well formed. Checkout took card details and settled nothing. |
| `CRON_SECRET` in Vercel and absent from GitHub Actions | Each store looked fine on its own. The post-deploy smoke gate skipped its sentinel probes on every run from 2026-07-12 to 2026-07-30 and nobody noticed. |

They are variables that are PRESENT and WRONG: wrong scope, wrong shape, wrong
store, wrong sensitivity, or right in one place and absent in another.

---

## 2. The four locks

One manifest, four enforcement points. None of them hardcodes a variable name.
Adding a variable to the manifest is the entire change.

| Lock | File | Sees | Catches |
|---|---|---|---|
| 1 MANIFEST | `src/lib/env/manifest.mjs` | the declarations | nothing on its own: it is what the others read |
| 2 BUILD | `scripts/check-public-env.mjs` via `src/lib/health/critical-env.mjs` | the real values of the ONE scope being built | missing, empty, malformed, forbidden-here, cross-variable disagreement |
| 3 STORES | `scripts/check-env-stores.mjs` | both configuration stores, every scope, every pinned branch | wrong scope, wrong branch pinning, READ-BACK EXPOSURE, missing from GitHub Actions, cross-store secret disagreement |
| 4 RUNTIME | `src/lib/health/checks.ts` (`manifest` check) | the deployment actually serving traffic | drift introduced AFTER the build, by a dashboard edit |

Lock 1's own contract is machine-checked too, by
`tests/unit/env-manifest-contract.test.ts` and
`tests/unit/env-store-exposure.test.ts`, because a manifest entry with no
opinion attached would report PRESENT AND CORRECT forever, green purely because
nothing ever asked anything of it.

---

## 3. The store rules

### 3.1 Two different questions

These are constantly confused and the confusion breaks things in both
directions:

- **`policyFor(entry, scope)`** asks: when the code RUNS as this scope, must the
  variable be in its process environment? A developer running the app on their
  own machine genuinely needs `SUPABASE_SERVICE_ROLE_KEY`.
- **`storePolicyFor(entry, scope)`** asks: may the VERCEL STORE keep a copy of
  it on that scope? For a secret on a scope the platform cannot protect, no.

Lock 2 and Lock 4 use `policyFor`. Lock 3 uses `storePolicyFor`.

### 3.2 The Development scope holds no secrets, ever

**Founder ruling R3, 2026-08-03.**

Vercel refuses `--sensitive` on the Development scope, by design, and answers
plainly when asked:

```json
{ "status": "error",
  "reason": "sensitive_not_allowed_on_development",
  "message": "--sensitive is not allowed with the Development Environment.
              Sensitive Environment Variables are only supported on Production and Preview." }
```

Development exists to be pulled to a laptop by `vercel env pull`, so a value
that could not be read back would be useless there. Therefore **every secret
stored on Development is readable in plain text by anyone with project access,
permanently, and no setting can change that.**

The earlier position was that this was tolerable, because
`LIVE_CREDENTIAL_ISOLATION` guarantees a non-production scope holds only test
credentials. **That argument is false for any credential with no test mode.**
The 2026-08-03 audit found, readable on Development:

| Variable | Protected by a mode rule? |
|---|---|
| `STRIPE_SECRET_KEY` (`sk_test_`) | yes, it is test mode |
| `SUPABASE_SERVICE_ROLE_KEY` (TEST project) | yes, ref isolation |
| `RESEND_API_KEY` | **NO. Resend has no test mode.** A live key that can send mail as the brand. |
| `GOOGLE_MAPS_API_KEY` | **NO. A billable key with no test mode.** |

All four were removed from the Development scope on 2026-08-03. The replacement
is not a weaker store, it is a different store: a local file.

### 3.3 The local `.env` pattern that replaces it

Secrets for local development live in a gitignored file on the machine that
needs them, and nowhere else.

1. Copy the template. It lists every variable with a description and no values:
   ```bash
   cp .env.example .env.local
   ```
2. Fill in the non-secret values by pulling what Development still legitimately
   holds (URLs, public keys, display names, feature flags):
   ```bash
   npx vercel@55 env pull .env.development --environment=development --yes
   ```
3. Fill in the SECRETS by hand, from the issuing system, never from Vercel:
   - `SUPABASE_SERVICE_ROLE_KEY` from the Supabase dashboard, **TEST project**
   - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from the Stripe dashboard,
     **test mode**
   - `RESEND_API_KEY` from the Resend dashboard
4. Never commit it. `.env*` is gitignored; confirm with `git status` before every
   commit.

> **Footgun, documented because it has bitten this repo:** on some older
> branches `.env.local` points at the PRODUCTION Supabase project. Use
> `.env.test` for TEST credentials where the branch already follows that
> convention, and check which project a file points at before running anything
> against it. `ALLOW_PRODUCTION_SUPABASE=1` is the deliberate, named escape
> hatch for a read-only production investigation, and it exists so that reaching
> production can never be accidental.

### 3.4 Read-back exposure is measured, never inferred

**`vercel env ls` cannot tell you whether a secret is exposed.** It prints the
literal string `Encrypted` for a genuinely sensitive record AND for a merely
encrypted one that `env pull` hands straight back in plain text. The two are
visually identical and only one of them is safe.

Exposure is therefore decided by ONE thing: what a scoped `env pull` actually
returns. A value that comes back proves the record is not sensitive.

The redaction marker is CLI-version dependent, and reading it wrong turns every
sensitive record into a false alarm: CLI 55 writes an empty string, CLI 58
writes the literal `[SENSITIVE]`. Both mean withheld, and both are treated as
withheld.

**A branch-pinned record is invisible to a scope-wide pull.** It must be pulled
with `--git-branch`, or it is not measured at all. Twenty-two records sat
unmeasured for the entire life of the checker, `STRIPE_SECRET_KEY`,
`CRON_SECRET`, `QUEUE_SECRET` and `HEALTH_CHECK_TOKEN` among them, while it
printed ALL CHECKS PASSED. Four of them were genuinely readable.

**An unmeasurable record fails loudly.** `evaluateStores` defaults to
`exposureAssessed: true`, so a caller that forgets the flag gets failures rather
than silence. A caller that genuinely cannot measure exposure, such as the
runtime sentinel reading the Vercel API without `decrypt`, must say so with
`exposureAssessed: false` and report that in its own output.

### 3.5 Sensitivity cannot be changed in place

`--force` does NOT change an existing record's sensitivity. The only way to make
a readable record sensitive is to remove it and re-add it:

```bash
npx vercel@55 env rm  NAME preview <git-branch> --yes
printf '%s' "$VALUE" | npx vercel@55 env add NAME preview <git-branch> --sensitive
```

Two behaviours were proven on a disposable probe record before this was used on
anything real, and both matter:

- `env rm NAME <scope> <git-branch>` removes **only** the pinned record. The
  scope-wide record survives. (An `env rm NAME` with no target is the one that
  cascades across scopes. Always name the target.)
- `printf '%s'` writes the value **byte-exact**, with no trailing newline.

Vercel also refuses to CREATE a branch-pinned record for a branch that does not
exist in the connected repository (`"reason": "branch_not_found"`), but it does
NOT remove records when a branch is later deleted. That asymmetry is why
`scripts/check-dead-branch-env.mjs` exists.

---

## 4. Senders and destinations

**Sending domain: `eventlinqs.com`.** Founder ruling R4. It is the only domain
on the Resend account and it is fully verified (DKIM, SPF and return path all
`verified`, confirmed 2026-08-03). `eventlinqs.com.au` has no Resend DNS at all
and cannot send. `EMAIL_FROM` is shape-checked against `@eventlinqs.com`.

Note that the canonical WEB host is `www.eventlinqs.com.au` while the SENDING
domain is `eventlinqs.com`. That is deliberate, not drift.

**Sending is not receiving.** Resend verification proves a domain can SEND. It
proves nothing about whether an address can RECEIVE, and the two are configured
independently: `eventlinqs.com` receives through Microsoft 365
(`eventlinqs-com.mail.protection.outlook.com`), which is unrelated to Resend.

Verified by sending and reading back the delivery event, 2026-08-03:

| Address | Result |
|---|---|
| `hello@eventlinqs.com` | **delivered** |
| `alerts@eventlinqs.com` | **hard bounced.** `550 5.4.1 Recipient address rejected: Access denied` (Exchange Online). No such mailbox. |

**Never configure an alert address without testing that it receives.** An alert
address that bounces is worse than no change, because the failure is silent at
exactly the moment something else has already gone wrong.

Every destination derives from one definition, `src/lib/env/destinations.ts`
(founder ruling R2). No personal address appears as a literal in shipped source.
The in-code fallback is deliberate and must stay: a required variable that
someone later deletes has to degrade to a real inbox, never to nothing.

---

## 5. The cross-store handshake

`CRON_SECRET` must be the same secret in Vercel Production and in GitHub
Actions. Neither store will reveal it, and printing it to compare would defeat
the point, so the comparison is an AUTHENTICATION HANDSHAKE: the copy the CI job
holds is presented as a bearer token to the production deployment, which
validates it against the Vercel copy. `200` proves they are byte-identical;
`401` proves they differ or one is absent.

This is strictly stronger than comparing fingerprints, because it also proves
the deployment currently serving traffic really holds the value.

```bash
node scripts/check-env-stores.mjs --mode=handshake
```

**A bearer token is DROPPED across a cross-host redirect.** curl and fetch both
do this. It turns a correct secret into a 401 that reads exactly like a
mismatch, so the handshake refuses to follow redirects and reports a redirect as
its own distinct failure. This is not hypothetical: the post-deploy smoke gate
probed `https://www.eventlinqs.com`, which 301s to the canonical
`https://www.eventlinqs.com.au`, and the bearer never arrived.

**NOT VERIFIED is a failure, never a pass.** A gate that switches itself off when
its input is missing is how this exact check stayed silent for eighteen days.

---

## 6. Running the locks

```bash
node scripts/check-public-env.mjs                    # Lock 2, also runs in prebuild
node scripts/check-env-stores.mjs                    # Lock 3, both halves
node scripts/check-env-stores.mjs --mode=stores      # Lock 3, store inventory only
node scripts/check-env-stores.mjs --mode=handshake   # Lock 3, cross-store proof (CI)
node scripts/verify/env-locks-verify.mjs             # break-and-restore harness, no credentials
node scripts/check-dead-branch-env.mjs               # branch-pinned records whose branch is gone
node scripts/generate-env-state.mjs                  # regenerate the snapshot
npx vitest run tests/unit/env-manifest-contract.test.ts tests/unit/env-store-exposure.test.ts
```

CI: `.github/workflows/env-locks.yml` runs the break-and-restore harness and the
cross-store handshake on push, on manual dispatch, and every six hours.

> **Scheduled runs only fire on the repository default branch.** Until this
> workflow is merged to `main`, the six-hourly schedule does NOT run and the
> only coverage is the push and dispatch triggers.

---

## 7. Adding a variable

1. Add the entry to `ENV_MANIFEST` in `src/lib/env/manifest.mjs`, with every
   field filled in: `describe`, `requiredOn`, `forbiddenOn`, `optionalOn`
   (with an `optionalReason` if it is optional everywhere), `mustBeSensitive`,
   `previewBranchScoping`, `shape`, `paymentCritical`, `githubActions`,
   `publicVar`.
2. Run the contract tests. They will tell you what you left out.
3. Set it in every store the manifest says it belongs in. If
   `mustBeSensitive` is true, it must NOT go on Development at all: put it in
   `.env.local` instead.
4. Regenerate the snapshot: `node scripts/generate-env-state.mjs`.

No guard needs editing. That is the point.

---

## 8. Rotation

See `docs/security/CREDENTIAL-ROTATION.md` for the per-credential runbook:
where each one is issued, every store it must land in, the order of operations
that avoids downtime, and the exact verification command.
