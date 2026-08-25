# Founder ruling: the Lighthouse mobile gate is ADVISORY, not required

**Date:** 25 August 2026
**Ruled by:** Lawal Adams
**Status:** BINDING. Do not reverse this on a guess. Read the evidence below first.

---

## The ruling, verbatim

> Make the Lighthouse mobile gate ADVISORY, not required.
>
> Remove it from main's required checks. It keeps running, keeps reporting,
> keeps emailing me. It stops blocking a merge.
>
> A gate that measures its own environment rather than the product is not a
> gate; and production is serving 404s on every organiser profile while this
> argues about 0.02.
>
> DO NOT move Sentry to idle. That reverses a documented prior decision for 0.02.

---

## What changed, exactly

`Lighthouse mobile gate` was removed from the required status checks on `main`.
Nothing else about branch protection was touched, and it was read back to prove
it:

```
BEFORE  contexts: ["lint · typecheck · build", "test (vitest)", "Lighthouse mobile gate"]
AFTER   contexts: ["lint · typecheck · build", "test (vitest)"]

unchanged: enforce_admins true, required_linear_history true,
           allow_force_pushes false, allow_deletions false,
           required_conversation_resolution true,
           dismiss_stale_reviews true
```

**The workflow still runs on every pull request to main, still asserts every
threshold, and still fails loudly when a page regresses.** It is deliberately NOT
given `continue-on-error`: a green-but-meaningless job would stop the failure
email, and the email is the point. What changed is that a red Lighthouse job no
longer holds the merge button.

---

## The evidence the ruling rests on

Measured on 25 August 2026, on the SAME commit and the SAME preview URLs, mobile
form factor, simulated throttling, after the image optimiser had been warmed:

| URL | CI runner | warmed real client |
|---|---|---|
| `/events` | 0.78, 0.76, 0.76 | **0.88** (FCP 1492, LCP 2992, TBT 243, SI 3981) |
| `/events/cat-indie-sounds-live-at-the-enmore-sydney` | 0.71, 0.72, 0.79 | **0.86** (FCP 1202, LCP 3077, TBT 320, SI 2788) |

Same bytes. Same build. The gap is the runner.

**No threshold was touched to reach this ruling, and the audited set was not
narrowed.** The floors in `lighthouserc.json` are exactly what they were, and the
pinned set in `lighthouse-gate-urls.json` still carries three event-detail pages
with the 1,200-seat arena chart first.

### What was fixed before the ruling, so this is not a retreat from real work

1. **The arena page's real defect.** 1,200 seat rows were serialised into the
   document as a prop: 571,171 bytes of HTML, 85 percent of it inline script.
   The chart now fetches its own seats when it comes within a screen of the
   viewport. Document 571,171 to 188,996 bytes, performance 0.78 to 0.85, LCP
   4,396 to 4,045ms, Speed Index 5,531 to 2,656ms. That page now clears the gate.

2. **An accessibility regression introduced by the fix.** The skeleton was a
   bare `div` carrying `aria-label`, which `aria-prohibited-attr` correctly
   refused. `role="status"` with real `sr-only` text: 0.97 to 1.00.

3. **The gate's own warm pass.** The step called "Warm ISR + the next/image
   optimiser" curled the page twice and requested no images at all. Every
   optimised image is a separate `/_next/image?url=...&w=...&q=...` request
   generated on first hit. It now warms every variant, which moved
   `artist-layer-launch-night-geelong` from failing to clearing and
   `cat-indie-sounds` from 0.71 to 0.78.

### What remains, and why it was not done

On the event page the hero image is **15KB and arrives in 148ms**, so the image
is not the cost. The weighted losses are LCP (0.78) and TBT (0.84). The page
loads 21 scripts totalling 438KB; the three largest (123KB, 95KB, 74KB) start at
1,277ms and 1,488ms against an observed load of 1,278ms, which is the Sentry SDK
landing after load exactly as `instrumentation-client.ts` intends. The pre-load
shell is about 209KB across 16 chunks, 74KB of which is react-dom.

There is no single remaining defect. Closing the last 0.02 would mean either
trimming that shell component by component on a checkout-bearing page, or moving
the Sentry boot off `window.load` onto idle.

**The second is explicitly forbidden by this ruling.** `instrumentation-client.ts`
and `docs/perf/sentry-client-surface.md` record a deliberate decision: the SDK is
deferred to `load` rather than to idle so Session Replay arms as early as it can
while the synchronous capture shim guarantees no error is lost. Trading that for
0.02 of a score measured on a runner is the wrong trade.

---

## What this does NOT change

- **The Lighthouse 95+ law in CLAUDE.md still stands** for what the product
  should achieve. This ruling is about what blocks a merge, not about what good
  looks like.
- **The other gates are unchanged and still required**: `lint · typecheck ·
  build` and `test (vitest)`. Both were and remain blocking.
- **The post-deploy smoke gate on main is untouched.**
- **Every threshold in `lighthouserc.json` is untouched**, and
  `tests/unit/ci/lighthouse-aggregation-contract.test.ts` still fails the build
  if the declared aggregation contract and the assertions drift apart.

## How to reverse it

Add the context back:

```bash
gh api -X POST \
  "repos/eventlinqs/eventlinqs-app/branches/main/protection/required_status_checks/contexts" \
  -f "contexts[]=Lighthouse mobile gate"
```

Do that when the runner variance is closed, not before. The honest close is
Issue #42 plus the client-shell work, each with its own evidence.
