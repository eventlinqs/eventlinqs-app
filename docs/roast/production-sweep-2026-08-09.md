# Production sweep, continued: A to E

Branch `fix/production-sweep`, worktree `C:/Users/61416/OneDrive/Desktop/EventLinqs/el-prod-sweep`.
Started from `ffe2f0f` (32 commits on `main`). Item 1, the platform-wide timezone
class, was already landed at `acee679`.

Progress is written after every item. Anything not finished is named here as NOT
DONE with what a user experiences until it is fixed.

---

## Working-environment findings (recorded because they invalidated an instrument)

**The worktree had no `node_modules` at all.** The entry existed as a dangling
junction, so `ls -d node_modules` succeeded while `ls node_modules` failed. A
first `npx tsc --noEmit` returned exit 0 against that, and it was NOT evidence:
there was no local TypeScript for it to use. That green was withdrawn rather
than reported. This is the D7 pattern exactly, caught on the instrument rather
than the code, and it is why the checklist in D7 exists.

Second-order finding: junctioning the worktree at the main repo's `node_modules`
gets vitest and tsc running, but that store is missing four packages this branch
needs (`@anthropic-ai/sdk`, `@googlemaps/js-api-loader`,
`@googlemaps/markerclusterer`, `@axe-core/playwright`), which produce 16 tsc
errors (8 x TS2307 plus implicit-any knock-ons) that belong to the store and not
to the branch. A real `npm ci` in the worktree is the only trustworthy base for
the build and the browser walks. The missing maps loader is directly relevant to
C4.

---

## A. THE LAUNCH BLOCKER

### A1. Why organiser signup actually failed. ROOT CAUSE FOUND AND REPRODUCED.

The founder saw, in a clean incognito window at `/signup?role=organiser`:

> Something went wrong on our side. Please try again, and contact us if it keeps happening.

**Root cause: a substring match defeated by one word.**

`src/app/api/auth/signup/route.ts` called
`admin.auth.admin.generateLink({ type: 'signup' })` and, on error, decided
whether the address was already taken by testing `error.message` for three
substrings: `already registered`, `already exists`, `user already`.

Reproduced against the TEST project (`vkapkibzokmfaxqogypq`) on 2026-08-09 by
creating a confirmed user and re-running the route's exact call. GoTrue answers:

```
error.status  : 422
error.code    : "email_exists"
error.message : "A user with this email address has already been registered"
```

The real string is "already **been** registered". It contains none of the three
substrings tested. Every duplicate signup therefore fell past the helpful branch
into `authMessage('unknown')`, which is the founder's sentence verbatim.

The founder's own account of the workaround confirms the shape: he recovered by
running a password reset **on an existing account**, so the address he typed was
already registered and confirmed. That is the reproduced case.

A second reproduction established a related fact worth recording: for an
already-registered but **unconfirmed** address, `generateLink` does not error at
all. It returns the same user id and a fresh token, so that path is a silent
re-send and never reached the "account exists" branch either.

**Every condition that produces the generic message, and whether production can
reach it today.**

| # | Condition | Reachable on production | Notes |
|---|---|---|---|
| 1 | Duplicate confirmed address (`email_exists`, 422) | **YES. This is the founder's case.** | Proven by reproduction |
| 2 | Supabase project unreachable, paused, or bad service-role key | YES | Falls to `unknown` |
| 3 | GoTrue password policy stricter than our 8-char rule (`weak_password`) | YES if policy tightened in the dashboard | Client checks length only |
| 4 | Address Zod accepts but GoTrue refuses (`email_address_invalid`) | YES | Blocked domains, stricter parser |
| 5 | GoTrue's own auth rate limit | YES | Distinct from our limiter |
| 6 | `handle_new_user` trigger failure (`unexpected_failure`) | YES | Any DB error creating the profile row |
| 7 | Platform 500 / proxy page / gateway timeout, no JSON body | YES | `payload.error` undefined, form fell to `unknown` |

**A separate defect found in the same path, and arguably worse.** The signup form
rendered `payload.error`, the class TOKEN, where its three sibling forms
(`login-form`, `forgot-password-form`, `resend-verification-button`) all render
`payload.message`, the sentence. The rate limiter's 429 body is
`{ ok:false, error:'rate_limited', message:'Too many requests...' }`. So a
rate-limited signup printed the literal string **`rate_limited`** into the red
box. Signup was the only one of the four endpoints on the wrong contract, on
both the sending and the receiving side.

That path is not hypothetical: `auth-signup` is `failClosed: true`, so an Upstash
outage returns 429 to **every** signup, and every one of them would have shown
the word `rate_limited`.

### A2. The message. FIXED.

**Research (Law 7, primary sources only).**

- OWASP Authentication Cheat Sheet, "Incorrect and correct response examples":
  lists **"This user ID is already in use."** as an INCORRECT registration
  response and **"A link to activate your account has been emailed to the
  address provided."** as the correct one. OWASP's registration pattern is to
  answer duplicate and fresh addresses identically and disambiguate by email.
- OWASP Forgot Password Cheat Sheet: "Return a consistent message for both
  existent and non-existent accounts."
- Eventbrite Help Centre, "Troubleshooting guide: Logging in to Eventbrite":
  "For security, your account is temporarily locked after 10 incorrect log in
  attempts. **Wait six minutes** to try again, or reset your password." A named
  wait and a named alternative.
- Eventbrite Help Centre, "Transfer Eventbrite account ownership": "If the email
  you want to change to is **already in use**, the account owner will need to
  either change their account email address or close their account." Eventbrite
  discloses existence.
- Humanitix: no published page found stating duplicate-signup behaviour.
  **UNSOURCED** rather than guessed.
- Ticketmaster, DICE, TryBooking, Moshtix, Oztix: no published page found
  stating duplicate-signup behaviour. **UNSOURCED.**

**The enumeration tension, and how it is resolved rather than picked silently.**

The two pulls are real and they point opposite ways. OWASP says do not confirm
an address is registered. The founder's requirement is that a person must know
whether to try a different email, a different password, wait, or contact us,
and "we emailed you something" does not answer that at the moment it is asked.

Resolved by **splitting on surface, because the risk is not uniform across
them**, and recording the decision in the copy deck itself so it reads as a
decision and not an oversight:

- **Sign-in, password recovery, magic link and verification resend keep the
  generic response.** That is where OWASP's rule bites hardest and where the
  existing code was already correct. Unchanged by this pass.
- **Registration names the duplicate.** What it costs, stated plainly: an
  attacker gains an email-existence oracle at the signup endpoint. What bounds
  it: the `auth-signup` limiter, 5 per IP per 10 minutes, unchanged. What it is
  not: a credential oracle, because sign-in and recovery still answer
  generically, so learning that an address is registered yields nothing
  further. Why it is worth it: on a public ticketing platform an organiser's
  contact address is routinely printed on their own event page, so the fact is
  of low sensitivity, and a stranded signup at the top of the acquisition funnel
  is not. Eventbrite, the benchmark, discloses the same fact.

This is a founder-visible product decision, so it is flagged rather than buried.
If the founder prefers OWASP's stricter pattern, the change is small and local:
answer 200 for a duplicate and send a "you already have an account" email
instead. Say the word and it flips.

**What each case now shows.**

| Case | Before | After |
|---|---|---|
| Email already registered | "Something went wrong on our side..." | "An account already uses that email address. Sign in instead, or reset your password if you have forgotten it." plus **Sign in** and **Reset your password** links |
| Password fails policy | "Please check your details and try again." | "Password must be at least 8 characters." |
| Rate limiter fired | the literal token **`rate_limited`** | "Too many attempts from this connection. Wait 10 minutes and try again." (the real wait, from the server) |
| Verification email could not send | (correct already) | "We could not send that email just now. This is a problem on our side, not with your account. Please try again in a few minutes." |
| Address GoTrue refuses | "Something went wrong on our side..." | "That email address was not accepted. Check it for a typo, or try another address." |
| Full name missing | "Please check your details and try again." | "Enter your full name." |
| Confirmation link could not be generated | "Could not generate confirmation link. Please try again." | "We could not start the email confirmation for that account. Nothing was saved, so please try again in a moment." |
| Supabase unreachable / anything unclassified | "...contact us if it keeps happening." with no route | "Something went wrong on our side, and no account was created. Please try again in a moment. If it keeps happening, contact us and we will sort it out." plus a **Contact us** link |

**How the fix works.** Classification moved off `error.message` and onto
`error.code`, via the `classifyAuthError` table this codebase already had and
this route was not using. `email_exists` and `user_already_exists` map to a new
`email_exists` class; `email_address_invalid` maps to a new `email_invalid`
class. A message fallback remains for the case where GoTrue sends no code, but
it is now a gap-tolerant pattern (`/already\b.{0,20}\b(registered|exists|in
use|taken)/`) rather than three fixed substrings, because one extra word is
exactly what broke the last one.

The route now answers on the house contract (`{ ok, error, message }`) that the
other three auth endpoints already used, with a real status per class (409 for a
duplicate, 429 rate limited, 502 mail transport). The form reads `message` like
its siblings, and uses the limiter's own `retryAfterSeconds` to name the wait,
to the Eventbrite standard.

**Guard hole closed while here.** `tests/unit/auth/auth-errors.test.ts` iterated
a hand-maintained array of failure classes, so a newly added class was exempt
from every copy rule the gate enforces (length, banned punctuation, no leaked
internals) while the suite stayed green. It now derives from
`ALL_FAILURE_CLASSES`, read back off the `MESSAGES` table, which the compiler
already forces to be exhaustive. Same shape of hole as the two in B.

**Tests: 37 passing, and drilled in both directions.** With the fix removed
(code map keys renamed, regex neutered), 5 tests fail with
`AssertionError: expected 'unknown' to be 'email_exists'`, which is the
founder's bug restated by the suite. Restored, all 37 pass.

**NOT DONE on A: the browser walk.** The cases above are proven by reproduction
against TEST and by unit test. They have NOT yet been triggered in a real
browser at 390 and 1440 with screenshots, because the worktree had no usable
toolchain until the install now running. Until that is done, A is not finished
to the standard of this brief.

---

## B to E: NOT STARTED

See the task list. Nothing below A has been begun.
