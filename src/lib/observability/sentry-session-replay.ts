// THE SESSION REPLAY RECORDER, IN ITS OWN MODULE, ON PURPOSE.
//
// THIS MODULE IS ONLY EVER REACHED BY DYNAMIC IMPORT, and it exists so that the
// rrweb recorder has a chunk of its own that nothing else can pull in.
//
// WHY IT WAS SPLIT OUT (close-out P0.5, 8 September 2026, and this is the whole
// reason the file exists). The arming code used to sit in sentry-client-boot.ts
// and reach the recorder with:
//
//     import('@sentry/nextjs').then(({ replayIntegration }) => ...)
//
// A dynamic import of a BARREL is a namespace import. The bundler must assume
// any property of the namespace object might be read, so it cannot tree-shake,
// so that one line pulls the whole @sentry/nextjs surface INCLUDING the rrweb
// recorder into the chunk group that dynamic import creates. The same file's
// STATIC named imports (`init`, `addIntegration`, `captureException`) shake
// perfectly and produce a 331.6 KB core chunk with no rrweb in it at all, which
// is what made the leak invisible: the core chunk looked clean.
//
// MEASURED. On 8 September 2026, after Session Replay had been moved to arm on
// the visitor's first interaction, the recorder chunk was STILL fetched at
// 4,323 ms with no input at all, 50 ms behind the core chunk, on 2 of 2 driven
// runs (scripts/verify/sentry-replay-window.mjs). Arming was correctly deferred
// - the `el:sentry-replay-armed` mark did not appear until the input at
// 10,301 ms - but 123.2 KB had already been downloaded and evaluated. Deferring
// the ARM while the BYTES still arrive buys nothing: the cost P0.5 names is the
// transfer and the evaluation, not the recording.
//
// So the recorder is reached through a module with NAMED imports, which the
// bundler can place in a chunk of its own, and nothing here may ever be imported
// statically. scripts/guards/sentry-off-the-paint-path.mjs holds both halves.

import { addIntegration, replayIntegration } from '@sentry/nextjs'

/**
 * Add the Session Replay integration to the already-initialised client.
 *
 * Called once, from armSessionReplay() in sentry-client-boot.ts, on the
 * visitor's first interaction with the page.
 */
export function addSessionReplay(): void {
  addIntegration(
    replayIntegration({
      // MASKING IS SENTRY'S DEFAULT AND STAYS THAT WAY (both default to true;
      // this call once set both to false, which disabled them).
      //
      // WHY. beforeSend does NOT apply to Session Replay. Sentry documents a
      // separate hook for that, beforeAddRecordingEvent, and there was none
      // here, so the scrubValue discipline that protects every error event did
      // not cover replays at all. With replaysOnErrorSampleRate at 1.0, every
      // error uploaded a recording of the preceding ~60s of DOM, with text
      // unmasked.
      //
      // What that DOM contains on this platform is other people's personal
      // data: the organiser attendee list and orders table render buyer names
      // and email addresses, the ticket page renders a ticket code, and
      // checkout renders a name and email. So an error on any of those screens
      // shipped buyer PII to a third party as readable text. Sentry's own
      // guidance for maskAllText: false is to use it "only if your site has no
      // sensitive data". This site is almost entirely other people's data.
      //
      // ASVS 14.2.3 (sensitive data must not be sent to untrusted parties) and
      // 16.2.5 (logging enforced by the data's protection level).
      //
      // COST, stated honestly: replays show masked text, so a replay localises
      // a fault to an element rather than showing the exact value. Recovering
      // fidelity is a matter of adding `unmask`/`unblock` selectors for regions
      // PROVEN to hold no personal data, which is safe because it is opt-in per
      // element. Turning masking off wholesale is not, because it is opt-out
      // for the entire product.
      maskAllText: true,
      blockAllMedia: true,
    }),
  )

  // Leave a performance mark when Replay actually starts recording.
  //
  // This exists so the no-buffer window is a measured number rather than a
  // guess. scripts/verify/sentry-replay-window.mjs reads it. The mark is free
  // (User Timing is already collected) and carries no PII.
  try {
    performance.mark('el:sentry-replay-armed')
  } catch {
    // User Timing is not load-bearing. Never let telemetry break the page.
  }
}
