# Publish bulletproof - root cause and elimination (2026-07-10)

All runs on the live staging alias (`eventlinqs-staging.vercel.app`), TEST
database, production untouched, payment engine untouched.

## Classification: PRODUCT-SIDE (a real race that could hit any organiser)

The reported flakiness was two distinct real defects plus one test-side
artefact, all now fixed:

1. **Lost cover on fast Continue (product-side, the main defect).** The Event
   Media step holds each image upload in its own local component state and
   syncs it up to the form through an effect. The wizard renders only the
   active step, so moving forward UNMOUNTS the media step. If the organiser
   clicked Continue in the 2 to 9 seconds before the storage upload finished,
   the upload completed onto an unmounted component - its stored URL never
   reached the form. The organiser reached Review with "No cover yet", the
   publish button correctly disabled, and no way forward: their cover had been
   silently lost. This is exactly what produced the "publish never enabled /
   did not reach kit" symptom.

2. **Invalid date window from Magic Start (product-side).** For an ambiguous
   description ("8pm to late"), the AI draft could return an end time that was
   empty, equal to, or before the start. The date step and publish both reject
   end <= start, so the publish was blocked with "End date and time must be
   after start date and time".

3. **Login rate limit in the test loop (test-side).** Logging in fresh 10
   times in a row tripped the correct auth-login protection (10 per 10 min) on
   the 9th run. Fixed by logging in once and reusing the session, as a real
   organiser does across events.

## Root cause, in one paragraph

When you add a cover photo, it uploads to storage in the background while you
keep filling in the form. The upload lived inside the "Event Media" screen,
and moving to the next screen threw that screen away. So if you clicked
Continue before the photo finished uploading, the finished photo had nowhere
to land: it was lost, and the final Publish step told you there was no cover,
with no obvious fix. On top of that, when Magic Start guessed an event that
ended at or before it started, Publish refused it. Both are now fixed at the
source.

## The fix (no retries, no masking)

- The wizard **refuses to advance past Event Media while any image is still
  uploading**, with the message "Your cover is still uploading. Give it a
  moment, then continue." The upload therefore always finishes while its
  screen is still mounted, and its URL always reaches the form. The race is
  gone, not retried.
- The Magic Start draft applier **guarantees end > start**, defaulting the end
  to two hours after the start whenever the AI's end is empty, equal, or
  earlier, computed in local datetime components (no timezone shift).
- **Double-click safety:** the publish button stays disabled through the
  success navigation, and the stable event id moved from a ref to state, so a
  second click cannot re-fire the create. Server-side, the stable event id is
  the row primary key, so a duplicate submit fails closed on the database
  rather than double-creating.

## The green run log (all on staging)

- **Magic Start to Publish to Launch Kit: 10 / 10 GREEN**, 11.1s to 13.1s each
  (draft 5.9s to 8.1s). Session reused across runs.
- **Slow-network (throttled 1.5 Mbps down / 750 Kbps up / 150ms latency):
  3 / 3 GREEN**, 16.5s to 17.0s each. A real organiser on a bad connection
  still publishes cleanly, because the wizard now waits for the slow upload
  rather than losing it.
- **Ordinary (non-Magic-Start) create and publish: 2 / 2 GREEN**, ~6s each -
  the same publish path, no such weakness.

Logs: `magic-free-log.json`, `magic-free-throttled-log.json`,
`ordinary-log.json` in this folder.
