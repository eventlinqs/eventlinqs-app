# Share conversions: PROVEN, not broken

Founder-ranked item 1 of the session-2 handover. Settled 8 August 2026 on TEST
against the code at branch HEAD.

## The question

The Launch Kit's central claim is a reach panel showing tickets sold per
channel. That claim rests on one cookie surviving a journey the platform does
not control: `el_share_code` is set at `/s/[code]`
(`src/app/s/[code]/route.ts`), and the conversion is written much later, on the
order confirmation render (`src/lib/broadcast/conversion.ts`), after the browser
has left the site for Stripe and come back.

Nothing proved that survival. It could not be settled by reading a number:

- **Production** has 1 order, 0 paid, 0 of 17 organisations able to charge. Zero
  conversions there proves nothing either way, and `reach-integrity` says so in
  those words rather than reporting a false pass.
- **TEST** had 10 conversions, but all were historical rows from sessions on
  2026-07-04, -10, -11, -12 and -23. They say nothing about the code at HEAD.

## The proof

`node scripts/verify/share-conversion-e2e.mjs http://localhost:3000`

Run against `next dev` on the TEST project, so the code under test is branch
HEAD and not a deployed older branch. The harness refuses to run unless the
Supabase project is TEST, and additionally refuses to trust the base URL until
it has found the link row it just minted **in TEST** (a server pointed at the
wrong database cannot get past that guard).

```
[setup] 40 candidate event(s) under 11 charge-ready organisation(s)
[setup] conversions on TEST before this run: 10

[drive] cat-a-midsummer-night-dream-on-stage-melbourne
  [PASS] mint: http://localhost:3000/s/VxAFQNHFeK (link 581fe87a-1072-4d29-85f1-5a6dd145574b, channel whatsapp)
  [PASS] redirect: landed on http://localhost:3000/events/cat-a-midsummer-night-dream-on-stage-melbourne
  [PASS] cookie-set: el_share_code=VxAFQNHFeK
  [PASS] click-recorded: 0 -> 1 click rows
  [PASS] cookie-survives-to-checkout: still VxAFQNHFeK
  [PASS] cookie-survives-stripe-round-trip: still VxAFQNHFeK after returning from Stripe
  [PASS] conversion-recorded: share_link_events 99bf4306-1a24-4ff0-bfa1-42707fad9e1d kind=conversion order=0d6a9c5e-c9d2-4dd0-92e6-7edb7d0c929a link=581fe87a-1072-4d29-85f1-5a6dd145574b at 2026-08-08T02:08:31.774548+00:00
  [PASS] conversion-credits-the-right-link: 581fe87a-1072-4d29-85f1-5a6dd145574b (minted 581fe87a-1072-4d29-85f1-5a6dd145574b)
  [PASS] order-is-a-real-paid-order: EL-86C9MXW3 confirmed 6354c AUD

conversions on TEST: 10 -> 11

verdict: PASS
```

Machine-readable evidence and three screenshots are beside this file.

## The verdict, stated precisely

**The share conversion path works end to end at HEAD.** A real card-4242
purchase of AUD 63.54, driven through a freshly minted tracked WhatsApp link,
produced a `share_link_events` row of kind `conversion` carrying that order id
and that link id. The cookie was verified present in the browser's own jar at
three separate points, including after the round trip through Stripe, which was
the specific leg nobody had evidence for.

**Order EL-86C9MXW3 came back `confirmed`, and that is not an artefact.** Only
the Stripe webhook writes that status (`src/app/api/webhooks/stripe/route.ts:700`);
nothing else in the codebase does. The localhost server created the payment
intent on the shared Stripe TEST account, Stripe delivered the event to that
account's configured endpoint (the staging deployment), and staging writes to
the same TEST database. So the webhook leg was genuinely exercised, by a
deployment rather than by the local server.

## What this does NOT prove

- It does not prove attribution under a **cross-site** cookie journey. The
  cookie is `sameSite: 'lax'`, which is correct for the top-level GET navigation
  Stripe uses to return, and that is the path exercised here. A future payment
  method that returned via a POST or an iframe would not send a lax cookie, and
  this harness would catch that.
- It does not prove anything about **production**, which still cannot take a
  payment at all: 0 of 17 organisations have `stripe_charges_enabled`. That is a
  separate, already-recorded launch blocker.
- The `share-conversions-fire` check in `reach-integrity` was already PASSing on
  TEST on historical rows. That pass was not evidence and should not have been
  read as any. It is evidence now.
