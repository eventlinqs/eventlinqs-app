/**
 * Raise an alert on TWO channels that do not share a rate limit.
 *
 * WHY THIS EXISTS (close-out H2.4, 8 September 2026). When the post-deploy
 * smoke failed on 7 September the alert email was never delivered. The step
 * was one line:
 *
 *     curl -fsSL -X POST https://api.resend.com/emails ... \
 *       || echo "::warning::Resend dispatch failed"
 *
 * Resend answered 429, `curl -f` threw the RESPONSE BODY AWAY, and the step
 * printed a warning and exited 0. So the one moment the platform had something
 * to say, it said it into a warning nobody reads, and the reason it could not
 * send was discarded on the way. An alert channel that silently drops is worse
 * than no channel, because it teaches the owner that silence means healthy.
 *
 * THREE THINGS ARE FIXED HERE.
 *
 * 1. THE LIMIT IS KNOWN AND RESPECTED. Resend publishes it: "The default
 *    maximum rate limit is 10 requests per second per team", and exceeding it
 *    returns 429 (https://resend.com/docs/api-reference/introduction, fetched
 *    2026-09-08). A 429 is retried with backoff instead of being given up on.
 *
 * 2. THE REASON IS READ, NEVER DISCARDED. Resend returns three different 429s
 *    (https://resend.com/docs/api-reference/errors, fetched 2026-09-08):
 *    `rate_limit_exceeded` means slow down and try again, while
 *    `daily_quota_exceeded` and `monthly_quota_exceeded` mean retrying is
 *    pointless and the account needs attention. The old step could not tell
 *    them apart because it never looked at the body. This one prints which.
 *
 * 3. THERE IS A SECOND CHANNEL. A GitHub issue on this repository, opened with
 *    the workflow's own token. It shares no limit, no vendor and no domain
 *    with Resend, it survives an inbox filter, and it is a durable record
 *    rather than a message. If BOTH channels fail this script exits non-zero
 *    and says so loudly, because a failed alert must never be a warning.
 *
 * TWO LATER RULINGS ARE ALSO SERVED HERE, because both are about the SUBJECT
 * LINE and splitting them across two files would have meant two grammars.
 *
 * CLOSE-OUT H2.6, a drill must announce itself as a drill. The 8 September
 * drill fired correctly against https://smoke-drill.invalid and the email
 * arrived reading "EventLinqs production homepage smoke FAILED", with nothing
 * to say it was a test. The owner reasonably read it as a real outage. The
 * marker is now DERIVED from the target rather than from a flag somebody has
 * to remember: a host in the reserved `.invalid` domain cannot be a real
 * production smoke. RFC 2606 puts it plainly: ".invalid" is intended for use
 * in online construction of domain names that are sure to be invalid and which
 * it is obvious at a glance are invalid
 * (https://www.rfc-editor.org/rfc/rfc2606.html, fetched 2026-09-10).
 *
 * CLOSE-OUT UX4.3, an outage must be distinguishable at a glance from a branch
 * gate. Every alert now declares its CLASS and the class writes the subject, so
 * the four things the owner can be told apart before opening anything:
 *
 *   EventLinqs OUTAGE: ...          main red, a failed production deploy, a
 *                                   failed post-deploy smoke. Both channels.
 *   EventLinqs BUILD STALLED: ...   nothing pushed in six hours (UX4.2).
 *   EventLinqs daily state: ...     the once-a-day state of everything (UX4.1).
 *   EventLinqs: ...                 business, sent by the product itself (UX3).
 *
 * Usage:
 *   node scripts/ops/alert-dispatch.mjs --subject "..." [--report report.json]
 *                                       [--body-file file.txt] [--dry-run]
 *                                       [--class outage|stall|daily]
 *                                       [--target https://...] [--drill]
 *                                       [--second-channel always|on-failure]
 *
 * Environment:
 *   RESEND_API_KEY      channel 1. Absent means channel 1 is unavailable,
 *                       which is a failure of that channel, never a skip.
 *   ALERT_TO            destination override. Defaults to the platform inbox.
 *   ALERT_FROM          sender override. Defaults to the platform no-reply.
 *   GITHUB_TOKEN        channel 2, needs `issues: write`.
 *   GITHUB_REPOSITORY   owner/repo, set by Actions.
 *   RUN_URL, COMMIT_SHA, EVENT   context printed into both channels.
 *   REF_SHA             the commit the workflow ran FROM, which is not the same
 *                       fact as the commit under test. The H2.5 drill's alert
 *                       said "Commit: unknown", which was true (a manual
 *                       dispatch pins no commit) and told the reader nothing.
 *
 * Exit codes:
 *   0  at least one channel delivered
 *   1  every channel failed
 *   2  the script was asked for something it cannot do
 */

import { readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'
import {
  ALERT_CLASSES,
  DRILL_MARKER,
  judgeDrill,
  alertSubject,
  drillBanner,
  secondChannelWanted,
} from '../lib/alert-classes.mjs'

/**
 * ADDRESS BOUNDARY, stated because it looks like a duplicate of
 * src/lib/email/sender.ts and src/lib/env/destinations.ts and is not.
 *
 * Those two modules are TypeScript inside the Next application and are the
 * single source for mail the PRODUCT sends. This script runs on a CI runner
 * with no application build and no database, and it exists to speak when the
 * product cannot. Both values are overridable by environment so a change is
 * still one edit, and both match what those modules resolve to today
 * (PLATFORM_INBOX, and the no-reply on the sending domain).
 */
const DEFAULT_TO = 'hello@eventlinqs.com'
const DEFAULT_FROM = 'EventLinqs Smoke <noreply@eventlinqs.com>'

const RESEND_ATTEMPTS = 4
const GITHUB_ATTEMPTS = 3

/**
 * THE SUBJECT GRAMMAR AND THE DRILL VERDICT live in scripts/lib/alert-classes.mjs,
 * a module that depends on nothing, so scripts/guards/alert-routing.mjs can
 * EXECUTE them without dragging this file GITHUB_TOKEN read and its runbook
 * paths into a guard that also runs on the Vercel build host (close-out F2.1).
 *
 * Re-exported here because this is where a reader looks for them.
 */
export { ALERT_CLASSES, DRILL_MARKER, judgeDrill, alertSubject, drillBanner, secondChannelWanted }

/**
 * Where a reader is sent, per class. This is the ONLY thing in the alert path
 * that names a documentation file, and it stays here rather than in the class
 * table for exactly that reason.
 */
const RUNBOOKS = {
  outage: 'docs/observability/post-deploy-smoke.md',
  stall: 'docs/observability/state-report.md',
  daily: 'docs/observability/state-report.md',
  business: 'docs/observability/state-report.md',
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Backoff before attempt n. Wide enough to outlast a one-second bucket. */
export function alertBackoffMs(attempt) {
  return [0, 1_500, 5_000, 12_000][Math.min(attempt - 1, 3)] ?? 12_000
}

/**
 * Decide what to do with a Resend answer.
 *
 * A `daily_quota_exceeded` and a `rate_limit_exceeded` are both 429 and mean
 * opposite things: one clears in a second, the other does not clear today. The
 * old step retried neither, because it never read which it had.
 */
export function judgeResendResponse(status, bodyText) {
  let name = null
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText)
      if (parsed && typeof parsed.name === 'string') name = parsed.name
    } catch {
      // A non-JSON body from Resend is itself worth reporting rather than
      // swallowing, so it is carried through as the reason below.
      name = null
    }
  }
  if (status >= 200 && status < 300) return { ok: true, retry: false, name, reason: 'accepted' }
  if (status === 429 && name === 'rate_limit_exceeded') {
    return { ok: false, retry: true, name, reason: 'rate limited: more than 10 requests per second per team' }
  }
  if (status === 429) {
    return {
      ok: false,
      retry: false,
      name,
      reason: `429 ${name ?? 'with no error name'}: a quota, not a burst. Retrying will not clear it; the Resend account needs attention`,
    }
  }
  if (status >= 500) return { ok: false, retry: true, name, reason: `Resend answered ${status}` }
  return { ok: false, retry: false, name, reason: `Resend refused with ${status} ${name ?? ''}`.trim() }
}

async function sendViaResend({ subject, html, dryRun }) {
  const key = process.env.RESEND_API_KEY ?? ''
  if (!key) {
    return { channel: 'resend', ok: false, reason: 'RESEND_API_KEY is not configured, so this channel does not exist on this runner' }
  }
  const to = process.env.ALERT_TO?.trim() || DEFAULT_TO
  const from = process.env.ALERT_FROM?.trim() || DEFAULT_FROM
  if (dryRun) return { channel: 'resend', ok: true, reason: `dry run: would send to ${to}` }

  let lastReason = 'never attempted'
  for (let attempt = 1; attempt <= RESEND_ATTEMPTS; attempt += 1) {
    const wait = alertBackoffMs(attempt)
    if (wait > 0) await sleep(wait)
    let status = null
    let bodyText = ''
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, reply_to: to }),
        signal: AbortSignal.timeout(20_000),
      })
      status = res.status
      bodyText = await res.text()
    } catch (err) {
      // NOT swallowed: the transport fault becomes this attempt's reason and
      // is printed on the line below.
      lastReason = `transport: ${err instanceof Error ? err.message : String(err)}`
      console.log(`  resend attempt ${attempt}/${RESEND_ATTEMPTS}: ${lastReason}`)
      continue
    }
    const judged = judgeResendResponse(status, bodyText)
    lastReason = judged.reason
    console.log(`  resend attempt ${attempt}/${RESEND_ATTEMPTS}: ${status} ${judged.reason}`)
    if (judged.ok) return { channel: 'resend', ok: true, reason: `delivered to ${to} on attempt ${attempt}` }
    if (!judged.retry) return { channel: 'resend', ok: false, reason: judged.reason }
  }
  return { channel: 'resend', ok: false, reason: `${RESEND_ATTEMPTS} attempts, last: ${lastReason}` }
}

/**
 * Channel 2. A GitHub issue, deduplicated by title: a smoke that fails on
 * three deploys in a row should produce one issue with three comments, not
 * three issues, or the channel becomes noise and gets muted, which is the
 * failure mode this whole item is about.
 */
async function raiseGithubIssue({ subject, markdown, dryRun }) {
  const token = process.env.GITHUB_TOKEN ?? ''
  const repo = process.env.GITHUB_REPOSITORY ?? ''
  if (!token || !repo) {
    return { channel: 'github-issue', ok: false, reason: 'GITHUB_TOKEN or GITHUB_REPOSITORY is absent, so this channel does not exist on this runner' }
  }
  if (dryRun) return { channel: 'github-issue', ok: true, reason: `dry run: would open an issue on ${repo}` }

  const api = async (path, init = {}) => {
    const res = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    })
    return { status: res.status, text: await res.text() }
  }

  let lastReason = 'never attempted'
  for (let attempt = 1; attempt <= GITHUB_ATTEMPTS; attempt += 1) {
    const wait = alertBackoffMs(attempt)
    if (wait > 0) await sleep(wait)
    try {
      const open = await api(`/repos/${repo}/issues?state=open&per_page=100`)
      if (open.status === 200) {
        const existing = JSON.parse(open.text).find((issue) => issue.title === subject && !issue.pull_request)
        if (existing) {
          const commented = await api(`/repos/${repo}/issues/${existing.number}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body: markdown }),
          })
          if (commented.status === 201) {
            return { channel: 'github-issue', ok: true, reason: `commented on the open issue #${existing.number}` }
          }
          lastReason = `could not comment on #${existing.number}: ${commented.status} ${commented.text.slice(0, 200)}`
          console.log(`  github attempt ${attempt}/${GITHUB_ATTEMPTS}: ${lastReason}`)
          continue
        }
      } else {
        console.log(`  github attempt ${attempt}/${GITHUB_ATTEMPTS}: could not list issues (${open.status}); opening a new one anyway`)
      }
      const created = await api(`/repos/${repo}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title: subject, body: markdown }),
      })
      if (created.status === 201) {
        const number = JSON.parse(created.text).number
        return { channel: 'github-issue', ok: true, reason: `opened issue #${number}` }
      }
      lastReason = `${created.status} ${created.text.slice(0, 300)}`
      console.log(`  github attempt ${attempt}/${GITHUB_ATTEMPTS}: ${lastReason}`)
    } catch (err) {
      lastReason = `transport: ${err instanceof Error ? err.message : String(err)}`
      console.log(`  github attempt ${attempt}/${GITHUB_ATTEMPTS}: ${lastReason}`)
    }
  }
  return { channel: 'github-issue', ok: false, reason: `${GITHUB_ATTEMPTS} attempts, last: ${lastReason}` }
}

/**
 * Build the human-readable failure detail from the smoke's own report, so the
 * alert says WHICH check failed and in which of the ways rather than "at least
 * one of the curl smokes failed", which was true of every failure and useful
 * for none of them.
 */
export function renderFailureLines(report) {
  if (!report) return ['No smoke report was produced, so the failure detail is only in the Actions log.']
  const lines = []
  lines.push(`Site: ${report.site}`)
  lines.push(`Commit under test: ${report.expectedSha ?? 'not pinned'}`)
  lines.push(`Commit actually served: ${report.servedSha ?? 'unknown'} (${report.deploymentId ?? 'unknown deployment'})`)
  if (Array.isArray(report.failures) && report.failures.length > 0) {
    for (const failure of report.failures) {
      lines.push(`FAILED ${failure.name}: ${failure.reason}`)
      lines.push(`  what that means: ${failure.meaning}`)
    }
  } else {
    lines.push('The report names no failing check, which is itself worth investigating.')
  }
  return lines
}

export function parseArgs(argv) {
  const out = {
    subject: null,
    report: null,
    bodyFile: null,
    dryRun: false,
    cls: 'outage',
    target: null,
    drill: false,
    secondChannel: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => argv[(i += 1)]
    if (arg === '--subject') out.subject = next()
    else if (arg === '--report') out.report = next()
    else if (arg === '--body-file') out.bodyFile = next()
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--class') out.cls = next()
    else if (arg === '--target') out.target = next()
    else if (arg === '--drill') out.drill = true
    else if (arg === '--second-channel') out.secondChannel = next()
    else return { error: `unrecognised argument ${arg}` }
  }
  if (!out.subject) return { error: 'a --subject is required' }
  if (!Object.prototype.hasOwnProperty.call(ALERT_CLASSES, out.cls)) {
    return { error: `--class ${out.cls} is not one of ${Object.keys(ALERT_CLASSES).join(', ')}` }
  }
  if (out.secondChannel !== null && out.secondChannel !== 'always' && out.secondChannel !== 'on-failure') {
    return { error: `--second-channel ${out.secondChannel} is not always or on-failure` }
  }
  return out
}

/*
 * EXIT WITH process.exitCode AND LET THE LOOP DRAIN, never process.exit().
 *
 * Driving the machine-callers guard's failure drill on Windows produced exit
 * 3221226505 and a libuv assertion on UV_HANDLE_CLOSING instead of exit 1:
 * process.exit() tears the loop down while undici still holds the socket the
 * last fetch opened. A script that CRASHES instead of failing sends its next
 * reader looking for a bug in Node. Every script here that makes a request
 * ends the same way for the same reason.
 */

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.error) {
    console.error(`alert-dispatch: ${args.error}`)
    process.exit(2)
  }

  let report = null
  if (args.report) {
    try {
      report = JSON.parse(readFileSync(args.report, 'utf8'))
    } catch (err) {
      // Named rather than swallowed: an alert that cannot read the report is
      // still sent, and says so, because the alert matters more than its detail.
      console.log(`  could not read ${args.report}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  let extra = ''
  if (args.bodyFile) {
    try {
      extra = readFileSync(args.bodyFile, 'utf8')
    } catch (err) {
      console.log(`  could not read ${args.bodyFile}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const runUrl = process.env.RUN_URL ?? ''
  const commit = process.env.COMMIT_SHA ?? ''
  const refSha = process.env.REF_SHA ?? ''
  const event = process.env.EVENT ?? ''

  // H2.6: the target decides, and the report's own `site` is the target
  // whenever there is a report, so the smoke's drill switch marks its alert
  // without anybody having to remember a second flag.
  const target = args.target ?? report?.site ?? null
  const verdict = judgeDrill({ target, forced: args.drill })
  const table = ALERT_CLASSES[args.cls]
  const subject = alertSubject({ cls: args.cls, drill: verdict.drill, subject: args.subject })

  // A body file with no report is the WHOLE detail, not a footnote to
  // "no smoke report was produced": the daily state and the stall alert have
  // no smoke report and never will.
  const detail = report || !extra ? renderFailureLines(report) : extra.split(/\r?\n/)
  const banner = verdict.drill ? drillBanner(verdict) : []
  const footnote = report && extra ? extra : ''

  const markdown = [
    `**${subject}**`,
    '',
    ...(banner.length > 0 ? [...banner.map((line) => `> ${line}`), ''] : []),
    `- Class: \`${args.cls}\`. ${table.meaning}`,
    `- Trigger: \`${event || 'unknown'}\``,
    `- Commit under test: \`${commit || 'none pinned'}\``,
    `- Ran from: \`${refSha || 'unknown ref'}\``,
    runUrl ? `- Run: ${runUrl}` : '- Run: unknown',
    '',
    '```',
    ...detail,
    '```',
    footnote ? `\n${footnote}` : '',
    '',
    `Runbook: \`${RUNBOOKS[args.cls]}\``,
  ].join('\n')

  const html = [
    `<h2>${subject}</h2>`,
    ...(banner.length > 0
      ? [`<p style="padding:12px;border:2px solid #b45309;background:#fffbeb"><b>${banner[0]}</b><br>${banner.slice(1).join('<br>')}</p>`]
      : []),
    '<ul>',
    `  <li><b>Class:</b> ${args.cls}. ${table.meaning}</li>`,
    `  <li><b>Trigger:</b> ${event || 'unknown'}</li>`,
    `  <li><b>Commit under test:</b> <code>${commit || 'none pinned'}</code></li>`,
    `  <li><b>Ran from:</b> <code>${refSha || 'unknown ref'}</code></li>`,
    runUrl ? `  <li><b>Run:</b> <a href="${runUrl}">${runUrl}</a></li>` : '  <li><b>Run:</b> unknown</li>',
    '</ul>',
    `<pre>${detail.join('\n')}</pre>`,
    footnote ? `<pre>${footnote}</pre>` : '',
    `<p>Runbook: <code>${RUNBOOKS[args.cls]}</code></p>`,
  ].join('\n')

  console.log(`alert-dispatch: ${subject}`)
  console.log(`  class ${args.cls}; drill ${verdict.drill ? 'YES' : 'no'} (${verdict.reason})`)
  for (const line of detail) console.log(`  ${line}`)

  // An OUTAGE opens both channels AT ONCE, because the whole point of a second
  // channel that shares no rate limit is that it is not waiting behind the
  // first one's backoff. A daily state opens the issue only if the email could
  // not be delivered, because a digest that files an issue every morning is
  // exactly the noise close-out UX4 exists to remove.
  const bothAtOnce = secondChannelWanted({ cls: args.cls, override: args.secondChannel, firstChannelFailed: false })
  let results
  if (bothAtOnce) {
    results = await Promise.all([
      sendViaResend({ subject, html, dryRun: args.dryRun }),
      raiseGithubIssue({ subject, markdown, dryRun: args.dryRun }),
    ])
  } else {
    const first = await sendViaResend({ subject, html, dryRun: args.dryRun })
    results = [first]
    if (secondChannelWanted({ cls: args.cls, override: args.secondChannel, firstChannelFailed: !first.ok })) {
      results.push(await raiseGithubIssue({ subject, markdown, dryRun: args.dryRun }))
    } else {
      console.log(`  github-issue: held back; class ${args.cls} opens an issue only when the first channel fails, and it did not`)
    }
  }

  for (const result of results) {
    console.log(`${result.ok ? 'DELIVERED' : 'FAILED   '} ${result.channel}: ${result.reason}`)
  }

  const delivered = results.filter((r) => r.ok)
  declareWork('alert-dispatch', {
    did: { 'channel attempted': results.length, 'channel delivered': delivered.length },
    found: { 'channel that could not deliver': results.length - delivered.length },
    zeroIsFine: {
      'channel delivered': 'zero delivered is the failure this script exits 1 for, named on the line below rather than swallowed here',
    },
    exitOnZero: false,
  })
  if (delivered.length === 0) {
    console.log('::error::Every alert channel failed. Nobody has been told about this failure by any route except this log.')
    process.exitCode = 1
    return
  }
  if (delivered.length < results.length) {
    for (const failed of results.filter((r) => !r.ok)) {
      console.log(`::warning::Alert channel ${failed.channel} failed: ${failed.reason}. ${delivered.length} of ${results.length} channels delivered.`)
    }
  }
  console.log(`alert-dispatch: ${delivered.length} of ${results.length} channels delivered`)
}

// Only run when invoked directly, so the pure helpers above can be imported by
// tests without dispatching an alert.
if (process.argv[1] && process.argv[1].endsWith('alert-dispatch.mjs')) {
  main().catch((err) => {
    console.error('alert-dispatch: the dispatcher itself failed')
    console.error(err)
    process.exit(1)
  })
}
