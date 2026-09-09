/**
 * THE ALERT GRAMMAR. Close-out UX4.3 and H2.6, as a module that depends on
 * NOTHING: no filesystem, no environment, no network, no documentation path.
 *
 * WHY IT IS A SEPARATE FILE FROM THE DISPATCHER. scripts/guards/alert-routing.mjs
 * EXECUTES these functions rather than reading them, which is the only honest way
 * to assert that a drill still marks itself. Importing them from
 * alert-dispatch.mjs pulled the whole dispatcher into the guard's import graph,
 * and with it a GITHUB_TOKEN read and two `docs/observability/...` runbook
 * literals. build-host-needs-declared then correctly reported that the guard
 * depended on docs and on a token, neither of which exists on the Vercel build
 * host (close-out F2.1).
 *
 * The registry's own header says what to do about that, and it is not to add a
 * declaration: "If a script has started reading something the build host lacks
 * and does not need to, the fix is to stop reading it." So the grammar moved
 * here and the runbook paths stayed with the dispatcher, which is the only thing
 * that prints them.
 *
 * THE FOUR CLASSES, and why the owner needs them told apart before opening
 * anything:
 *
 *   EventLinqs OUTAGE: ...          main red, a failed production deploy, a
 *                                   failed post-deploy smoke. Both channels.
 *   EventLinqs BUILD STALLED: ...   nothing pushed in six hours (UX4.2).
 *   EventLinqs daily state: ...     the once-a-day state of everything (UX4.1).
 *   EventLinqs: ...                 business, sent by the product itself (UX3).
 */

export const ALERT_CLASSES = {
  outage: {
    prefix: 'EventLinqs OUTAGE: ',
    secondChannel: 'always',
    meaning: 'Something a visitor can see is broken right now.',
  },
  stall: {
    prefix: 'EventLinqs BUILD STALLED: ',
    secondChannel: 'always',
    meaning: 'The build has gone quiet. Nothing has failed, which is why nothing else can tell you.',
  },
  daily: {
    prefix: 'EventLinqs daily state: ',
    secondChannel: 'on-failure',
    meaning: 'The once-a-day state of everything. Its ABSENCE is the alert.',
  },
  business: {
    prefix: 'EventLinqs: ',
    secondChannel: 'on-failure',
    meaning: 'Somebody did something on the platform.',
  },
}

/** The marker that has to be impossible to miss and impossible to take off. */
export const DRILL_MARKER = '[DRILL] '

/**
 * Is this alert about a drill target rather than about production?
 *
 * DERIVED, not declared, because close-out H2.6 exists precisely because a
 * human had to remember to say so and did not. The 8 September drill fired
 * against https://smoke-drill.invalid and arrived reading "EventLinqs
 * production homepage smoke FAILED", and the owner reasonably read it as a real
 * outage.
 *
 * A host in the reserved `.invalid` domain cannot be a real production surface.
 * RFC 2606 puts it plainly: ".invalid" is intended for use in online
 * construction of domain names that are sure to be invalid and which it is
 * obvious at a glance are invalid
 * (https://www.rfc-editor.org/rfc/rfc2606.html, fetched 2026-09-10).
 *
 * `forced` remains available for an alert with no target at all, and it can
 * only ever ADD the marker. Nothing takes it off a `.invalid` target.
 *
 * @param {{ target?: string | null, forced?: boolean }} input
 */
export function judgeDrill({ target, forced = false } = {}) {
  let host = ''
  if (target) {
    try {
      host = new URL(target).hostname
    } catch {
      host = String(target).replace(/^[a-z]+:\/\//i, '').split('/')[0]
    }
  }
  if (host && /(^|\.)invalid$/i.test(host)) {
    return {
      drill: true,
      host,
      reason: `the target ${host} is in the reserved .invalid domain (RFC 2606), so nothing real was reached`,
    }
  }
  if (forced) return { drill: true, host: host || null, reason: 'the caller declared this run a drill' }
  return {
    drill: false,
    host: host || null,
    reason: host ? `the target ${host} is a real host` : 'no target was given, and nothing declared this a drill',
  }
}

/**
 * The subject line, from the class, the drill verdict and what happened.
 *
 * The drill marker leads, because a reader scanning a list of subjects on a
 * phone sees the first characters and nothing else.
 *
 * @param {{ cls?: string, drill?: boolean, subject: string }} input
 */
export function alertSubject({ cls = 'outage', drill = false, subject }) {
  const table = ALERT_CLASSES[cls] ?? ALERT_CLASSES.outage
  const prefixed = subject.startsWith(table.prefix) ? subject : `${table.prefix}${subject}`
  if (!drill) return prefixed
  return `${DRILL_MARKER}${prefixed}`
}

/**
 * The lines that open a drill body, so a reader who opens it is told in the
 * first sentence and never has to work it out from the target.
 */
export function drillBanner(verdict) {
  return [
    'THIS IS A DRILL. It is a scheduled test of the alerting path and no action is required.',
    `Target used: ${verdict.host ?? 'none'}. Why this is a drill: ${verdict.reason}.`,
    'A real alert never carries the [DRILL] marker.',
  ]
}

/**
 * Whether the second channel is used on this run.
 *
 * An OUTAGE opens both at once, because the whole point of a second channel
 * that shares no rate limit is that it is not waiting behind the first one's
 * backoff. A daily state opens the issue only if the email could not be
 * delivered, because a digest that files an issue every morning is exactly the
 * noise close-out UX4 exists to remove.
 *
 * @param {{ cls?: string, override?: string|null, firstChannelFailed?: boolean }} input
 */
export function secondChannelWanted({ cls, override = null, firstChannelFailed = false }) {
  const policy = override ?? ALERT_CLASSES[cls]?.secondChannel ?? 'always'
  if (policy === 'always') return true
  return firstChannelFailed === true
}
