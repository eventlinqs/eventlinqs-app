# The signup failure contract

What a person is told when creating an EventLinqs account does not work, why each
sentence says what it says, and the one open founder decision.

Authority: `src/lib/auth/auth-errors.ts` is the copy and the classifier;
`src/app/api/auth/signup/route.ts` is the only producer;
`tests/unit/auth/signup-failures.test.ts` is the lock. Where this document and
the code disagree, the code wins and this document is stale.

## Why this exists

On 8 August 2026 at 20:01:08 UTC the founder tried to sign up as an organiser on
production, in a clean incognito window, with a Gmail address. The page answered:

> Something went wrong on our side. Please try again, and contact us if it keeps
> happening.

That was the entire message. The production log line for the same request:

```
POST /api/auth/signup 400
[auth/signup] generateLink failed
  { reason: 'A user with this email address has already been registered' }
```

The address already had an account. The route already had a branch that said so.
It could never run, because the branch was selected by testing GoTrue's message
for the substrings `already registered`, `already exists` and `user already`, and
`already been registered` contains none of them. Every unmatched failure fell
through to the generic sentence.

Reproduced on the TEST project, both directions:

| Attempt | GoTrue answer | Old route behaviour |
|---|---|---|
| Address already registered | `code: email_exists`, `status: 422`, message as above | 400, generic sentence |
| Fresh address | no error, user created, token minted | 200, correct |
| Password under the project policy | `code: weak_password`, `status: 422` | 400, generic sentence |

So the generic sentence was not a rare edge. It was the answer to the single most
common way a signup fails.

This is the second time prose matching produced this class of bug here. See the
2026-08-03 note in `src/lib/auth/dispatch-auth-link.ts`, where checking for
`user not found` against GoTrue's `User with this email not found` built an
enumeration oracle. Prose is not an API. Both paths now key on `code` and
`status`.

## What each case now shows

Every failure names a cause or names us, and answers "so do I try a different
email, a different password, wait, or contact us". The generic sentence is
unreachable from this endpoint.

| Case | Class | HTTP | Where it appears | What the person reads |
|---|---|---|---|---|
| Email already registered | `email_exists` | 409 | under the email field | That email address already has an EventLinqs account. Sign in instead, or reset your password if you have forgotten it. **Plus Sign in and Reset your password links, both carrying the address already typed.** |
| Password under 8 characters | `weak_password` | 400 (client-side before that) | under the password field | Password must be at least 8 characters. Choose a longer one and try again. |
| Password refused by the project policy | `weak_password` | 400 | under the password field | as above |
| Email malformed | `invalid_email` | 400 | under the email field | That email address does not look right. Check it and try again. |
| Name blank | `missing_name` | 400 | under the name field | Enter your full name so organisers and attendees know who you are. |
| Rate limiter fired | `rate_limited` | 429 | form alert | Too many attempts from this connection. Please wait about N minutes and try again. **N is the real Retry-After, not a guess.** |
| Verification email could not be sent | `mail_transport_failed` | 502 | form alert | We could not send that email just now. This is a problem on our side, not with your account. Please try again in a few minutes. **Plus a Contact us link.** The half-created account is deleted so the retry works. |
| Supabase unreachable, 5xx, thrown fetch, or no token minted | `service_unavailable` | 503 | form alert | We could not reach our account service just now. This is a problem on our side, not with your details. Please try again in a moment. **Plus a Contact us link.** |
| Service-role key missing or blank | `service_unavailable` | 503 | form alert | as above. Previously an uncaught throw, so a Next 500 with an HTML body the form could not parse, which rendered as the generic sentence. |
| Anything else GoTrue declines (4xx) | `signup_rejected` | 400 | form alert | We could not create an account with those details. Check your email address and password, or sign in if you already have an account. |
| Browser could not reach us | `network` | n/a | form alert | We could not reach EventLinqs. Check your connection and try again. |

Two behaviours worth recording because they are not obvious from the table:

- **An unconfirmed account is not a failure.** Verified on TEST: calling
  `generateLink({type:'signup'})` for an address whose account exists but is
  unconfirmed re-mints a fresh link against the same user rather than erroring.
  Someone who never received the first email can simply sign up again. So
  `email_exists` only ever describes a CONFIRMED account, which is what makes
  "sign in, or reset your password" always sound advice rather than a dead end.
- **The rate limiter used to leak a machine token.** The shared limiter answers
  `{ ok: false, error: 'rate_limited', message: '...' }`, and the form printed
  `payload.error`. A rate-limited person was shown the literal string
  `rate_limited`. The endpoint now reshapes the 429 into the contract below.

## The response contract

Every non-200 from `/api/auth/signup`:

```jsonc
{
  "ok": false,
  "failure": "email_exists",          // the class, so the form picks its links
  "error": "That email address ...",  // the sentence, from the copy deck
  "field": "email",                   // which input, or null for the form alert
  "retryAfterSeconds": 480            // rate limit only
}
```

The provider's own error string never appears in it. Causes are logged
server-side with `failure`, `code`, `status` and `reason`.

## The proof

`scripts/verify/signup-failure-walk.mjs <base-url>` drives the real form in
Chromium at 1440 and 390, in a fresh context per case (the founder's clean
incognito window), and writes screenshots plus a JSON record to
`docs/auth/walk-2026-08-09/`. It exits non-zero if any case renders the generic
sentence, renders no message at all, or is displaced by the rate limiter.

Each case is labelled `live` or `stubbed`, and the distinction is never blurred:

- **live** posts to the deployed endpoint and renders whatever comes back. This
  covers the already-registered address, the malformed email, the blank name,
  both password bounds, and the rate limiter.
- **stubbed** fulfils the response with the exact payload the route returns for
  that class, because the cause cannot be induced on a running preview: our mail
  transport does not fail on request, Supabase does not go down on request, and
  GoTrue does not invent an unmodelled error code on request. Those payloads are
  pinned by `tests/unit/auth/signup-failures.test.ts`, so what the walk does not
  prove, the test does. Only the rendering is being demonstrated.

Run one viewport per invocation for the live set (`--viewport=1440`, then
`--viewport=390` after the rate window rolls). Three live cases post, and
`auth-signup` allows five attempts per IP per ten minutes, so both viewports in
one run spends six and the last three come back 429.

`scripts/verify/signup-error-axe.mjs <base-url>` runs axe-core over the form in
two error states at both viewports. It found a contrast failure that predates
this work: `--color-error` (#DC2626) on the `bg-error/10` wash (#FCE9E9)
measures **4.13:1** at 14px, under the 4.5:1 AA floor, and that class string is
shared by every auth alert (login, forgot-password, reset-password, the
fragment-error banner, and signup). Fixed with `--color-error-strong` (#B91C1C,
5.54:1 on the wash and 6.47:1 on white), which is the same pattern
`--brand-accent-strong` already exists for on the gold side. `--color-error`
remains the border, icon and on-dark value.

Not swept beyond auth: `text-error` appears on roughly a dozen dashboard and
ticket surfaces which were not walked here. Those are a known follow-up, not a
silent fix.

## Account enumeration: the tension, and how it is resolved

### What the research says

- **OWASP Authentication Cheat Sheet** gives registration an explicit example
  pair: incorrect, "This user ID is already in use"; correct, "A link to
  activate your account has been emailed to the address provided". It states
  that "the account registration feature should also be taken into
  consideration, and the same approach of a generic error message can be applied
  regarding the case in which the user exists".
  <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
- **OWASP WSTG, Testing for Account Enumeration** is concerned with the login
  path and reserved usernames; its remediation is about consistent generic
  responses to failed authentication.
  <https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/03-Identity_Management_Testing/04-Testing_for_Account_Enumeration_and_Guessable_User_Account>

### What the competitors actually do (walked live, 9 August 2026)

- **Eventbrite** has no separate signup form at all. `/signin/signup/` renders
  one field: "Welcome! What's your email?". Submitting ANY address, registered or
  not, lands on the identical screen at `id.auth.eventbrite.com`: "Check your
  email for a code". Both branches verified, byte-identical. An
  "email already registered" error does not exist in their product, and there is
  no enumeration signal. This is precisely OWASP's prescribed pattern, shipped by
  the market leader.
- **Humanitix** unifies the two and says so in the subtitle: "Enter your email
  address below to log in to an existing account or sign up with a new one".
  Both the marketing "CREATE ACCOUNT" button and "Host login" land on the same
  `console.humanitix.com/signin` screen. An unregistered address routes on to
  `/signup` onboarding. The existing-account case is a sign-in step, never a red
  error.
- **TryBooking** is the only one of the three that still runs a classic
  first name / last name / email / password signup form, so it is the direct
  comparator. Its errors are FIELD-LEVEL, under the input that caused them, with
  a strength meter: "Not secure. This password is too easy to guess. Please
  choose another", and "Password is invalid" on submit. Never a page-level
  banner, never a generic sentence.

None of the three answers a failed signup with an unexplained page-level error.

### The resolution

The tension is real but it does not bite here, for one reason: **a signup form
that creates accounts already discloses whether an address is taken**, whatever
the copy says, because the attempt either succeeds or it does not, and it does so
in measurably different time. Vague wording does not close that oracle. It only
withholds the answer from the one person with a legitimate need for it, the
account's actual owner, who is standing in front of a red box deciding whether to
change the email or the password. The disclosure is paid for either way. Only the
honesty differs.

So: **be clear on screen, and keep the rest of auth shut.**

- Sign-in answers every credential failure with one sentence
  (`invalid_credentials`), identical for wrong password, unknown address, and
  Google-only account.
- Password reset and magic link answer generically
  (`RECOVERY_GENERIC_RESPONSE`, `MAGIC_LINK_GENERIC_RESPONSE`).
- This endpoint is capped at five attempts per IP per ten minutes
  (`auth-signup`, fail-closed), which is not a rate that enumerates a user base.

### The standing founder decision

The oracle is genuinely closed by ONE design, the one Eventbrite runs: collect
the email, always answer "check your email", and vary only what the message says,
which only the mailbox owner can read. Applied here that would mean an existing
address receives a "you already have an account, here is a sign-in link" email
instead of an on-screen message.

That is a flow change, not a copy change. It removes the password from the signup
form, delays account creation to the click, and would need its own build and its
own proof. It is not done, and it is not being done implicitly. It is recorded
here as the option, for a founder decision when launch is not blocked.
