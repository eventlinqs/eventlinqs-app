/**
 * THE DAILY STATE, AND THE STALL. Close-out UX4.1 and UX4.2, the pure half.
 *
 * WHY THIS EXISTS. From 00:23 to 09:28 on 9 September 2026 the build was
 * stalled, six runs were killed, nothing was pushed for nine hours, and NOT ONE
 * EMAIL WAS SENT, because nothing failed. Meanwhile six emails arrived for
 * branch gates doing their job, and zero arrived when a real organiser
 * published a paid event on production.
 *
 * A failure notification cannot see a stall. A stall produces silence, and
 * silence is indistinguishable from a quiet, healthy day unless something
 * arrives on a quiet day too. So:
 *
 *   UX4.1  one message a day, at a fixed time, WHETHER OR NOT anything is
 *          wrong. Its ABSENCE is itself the alert.
 *   UX4.2  and an immediate one when nothing has been pushed in six hours.
 *
 * Everything here is a pure function of a collected state object, so the
 * wording, the judgement and the boundary can be tested exhaustively without a
 * network, a clock or a mail server. The impure half, which does the
 * collecting and the sending, is scripts/ops/state-report.mjs.
 *
 * THE COLOURS ARE THE PLATFORM'S OWN TOKENS, read from src/app/globals.css
 * rather than picked: ink-900 #0A1628, gold-400 #E8B738 on dark, gold-700
 * #8B6A0E for text on light, ink-100 #EFEDE8, ink-200 #D9D9D6, ink-600
 * #4A4A4A, coral-600 #E63E2C. An operations email is still the platform
 * speaking, and Law 1 does not have an exception for the owner's inbox.
 */

/** The one threshold. Six hours, from close-out UX4.2, and it lives here alone. */
export const STALL_THRESHOLD_HOURS = 6

/** Brand tokens, copied from globals.css because an email cannot import CSS. */
export const INK_900 = '#0A1628'
export const INK_600 = '#4A4A4A'
export const INK_200 = '#D9D9D6'
export const INK_100 = '#EFEDE8'
export const GOLD_400 = '#E8B738'
export const GOLD_700 = '#8B6A0E'
export const CORAL_600 = '#E63E2C'
export const GREEN_700 = '#15803D'

const MS_PER_HOUR = 3_600_000

/** Hours between two instants, positive when `later` is after `earlier`. */
export function hoursBetween(earlierIso, laterIso) {
  const a = Date.parse(earlierIso)
  const b = Date.parse(laterIso)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return (b - a) / MS_PER_HOUR
}

/**
 * BOOKKEEPING REFS. A push to one of these is the build WRITING ITS OWN LOG,
 * never the build moving, so it must not reset the stall clock.
 *
 * Found 11 September 2026 (session 77). Twelve consecutive runs of the build
 * loop had each been refused at the same pre-push gate step, and each had then
 * pushed its three ledger files to ops/session-log, as the brief requires. The
 * stall judge read "the last push was 0.1 hours ago, to ops/session-log" and
 * found no stall, while nothing had reached a working branch for 44 hours. The
 * alert built for exactly that silence was blind for as long as the loop kept
 * confessing to it: the last 30 records of the repository activity listing were
 * all ops/session-log.
 */
export const BOOKKEEPING_REFS = ['ops/session-log']

/**
 * The newest push in one page of the repository activity listing that is not
 * bookkeeping. Pure: the page is whatever the caller fetched. What was passed
 * over is COUNTED, so the report can say it rather than hide it.
 *
 * @param {Array<{ activity_type?: string, ref?: string, timestamp?: string, actor?: { login?: string } }>} activity
 * @param {{ ignoreRefs?: string[] }} options
 */
export function pickLastPush(activity, { ignoreRefs = BOOKKEEPING_REFS } = {}) {
  const ignored = new Set(ignoreRefs.map((ref) => `refs/heads/${ref}`))
  let bookkeepingSkipped = 0
  for (const record of Array.isArray(activity) ? activity : []) {
    if (record?.activity_type !== 'push' && record?.activity_type !== 'force_push') continue
    if (ignored.has(record.ref)) {
      bookkeepingSkipped += 1
      continue
    }
    return {
      when: record.timestamp ?? null,
      ref: typeof record.ref === 'string' ? record.ref.replace('refs/heads/', '') : null,
      actor: record.actor?.login ?? null,
      bookkeepingSkipped,
    }
  }
  return { when: null, ref: null, actor: null, bookkeepingSkipped }
}

/**
 * The rel="next" target of a GitHub Link header as a path the API helper can
 * take, or null on the last page. The activity listing pages by cursor and the
 * cursor appears nowhere but that header
 * (https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api,
 * and observed on the live endpoint on 11 September 2026: rel="next" carrying
 * `after=`).
 */
export function nextLinkPath(linkHeader) {
  if (typeof linkHeader !== 'string' || linkHeader.length === 0) return null
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/)
    if (!match) continue
    try {
      const url = new URL(match[1])
      return `${url.pathname}${url.search}`
    } catch {
      return null
    }
  }
  return null
}

/**
 * Has the build stalled, and is this the moment to say so?
 *
 * BAND, not a boolean, because a stall that lasts a day must not produce an
 * alert every hour. The elapsed time is divided by the threshold: the first
 * alert goes at six hours, the next at twelve, then eighteen. So the owner sees
 * the stall getting older rather than the same line repeating, and a full day of
 * silence costs four messages rather than twenty four.
 *
 * TWO WAYS TO KNOW WHETHER THIS BAND HAS ALREADY BEEN RAISED, because the two
 * callers have genuinely different information and pretending otherwise would
 * make one of them wrong:
 *
 *   alreadyAlertedBand   the watchdog loop runs at irregular intervals and keeps
 *                        a small state file, so it simply knows.
 *   checkPeriodHours     a scheduled cloud run keeps nothing, but it knows how
 *                        often it runs. If the band is higher now than it was
 *                        one period ago, this run is the first inside the band
 *                        and is therefore the one that speaks. No state, no
 *                        parsing of a previous message, no drift.
 *
 * With neither, `shouldAlert` is true whenever stalled and the reason says so,
 * so a caller that has thought about neither gets a loud repeat rather than a
 * quiet miss.
 *
 * @param {{ lastPushIso: string|null, nowIso: string, thresholdHours?: number, alreadyAlertedBand?: number|null, checkPeriodHours?: number|null }} input
 */
export function judgeStall({
  lastPushIso,
  nowIso,
  thresholdHours = STALL_THRESHOLD_HOURS,
  alreadyAlertedBand = null,
  checkPeriodHours = null,
}) {
  if (!lastPushIso) {
    return {
      stalled: false,
      hoursSincePush: null,
      band: 0,
      shouldAlert: false,
      reason: 'no push was found at all, so there is no elapsed time to judge and this is reported rather than guessed',
    }
  }
  const hours = hoursBetween(lastPushIso, nowIso)
  if (hours === null) {
    return { stalled: false, hoursSincePush: null, band: 0, shouldAlert: false, reason: `the last push timestamp ${lastPushIso} could not be read as a date` }
  }
  const band = hours <= 0 ? 0 : Math.floor(hours / thresholdHours)
  const stalled = band >= 1

  let shouldAlert = stalled
  let dedupe = 'nothing told this run whether the band had already been raised, so it speaks every time'
  if (alreadyAlertedBand !== null && alreadyAlertedBand !== undefined) {
    shouldAlert = stalled && band > alreadyAlertedBand
    dedupe = `band ${band}, and band ${alreadyAlertedBand} had already been raised`
  } else if (checkPeriodHours !== null && checkPeriodHours !== undefined) {
    const previous = Math.floor(Math.max(0, hours - checkPeriodHours) / thresholdHours)
    shouldAlert = stalled && band > previous
    dedupe = `band ${band} now, band ${previous} one check (${checkPeriodHours} hours) ago`
  }

  return {
    stalled,
    hoursSincePush: hours,
    band,
    shouldAlert,
    dedupe,
    reason: stalled
      ? `nothing has been pushed for ${hours.toFixed(1)} hours, which is past the ${thresholdHours} hour threshold`
      : `the last push was ${hours.toFixed(1)} hours ago, inside the ${thresholdHours} hour threshold`,
  }
}

/**
 * The guard a failing run named, out of its own log.
 *
 * Close-out F1.1 made `run-guards.mjs` print `[guards] FAILED: <path>` on the
 * way out, precisely so that a reader never again has to open a log to find out
 * which of ninety guards caught something. This is that line being read by a
 * machine, which is the whole return on having made the gate say it.
 */
export function guardsNamedIn(logText) {
  if (!logText) return []
  const names = new Set()
  for (const line of String(logText).split(/\r?\n/)) {
    const match = line.match(/\[guards\] FAILED:\s*(\S.*)$/)
    if (match) {
      for (const part of match[1].split(/[,\s]+/)) {
        const trimmed = part.trim()
        if (trimmed) names.add(trimmed)
      }
    }
  }
  return [...names]
}

/** A duration a person reads without counting: "3 hours", "2 days". */
export function humanAge(hours) {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return 'unknown'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes`
  if (hours < 48) return `${Math.round(hours)} hours`
  return `${Math.round(hours / 24)} days`
}

/** Melbourne, because that is where the owner reads it. */
export function platformDate(iso, timeZone = 'Australia/Melbourne') {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d)
}

/**
 * THE HEADLINE. One word for the whole platform, decided in one place.
 *
 * Ordered by what a reader needs first: an outage outranks a stall, a stall
 * outranks a red branch, and nothing outranks nothing.
 */
export function headlineFor(state) {
  if (state.production?.readyState && state.production.readyState !== 'READY') {
    return { word: 'PRODUCTION IS NOT READY', colour: CORAL_600, urgent: true }
  }
  if (state.main?.conclusion === 'failure') return { word: 'MAIN IS RED', colour: CORAL_600, urgent: true }
  if (state.stall?.stalled) return { word: 'THE BUILD HAS STALLED', colour: CORAL_600, urgent: true }
  if ((state.failingBranches ?? []).length > 0) return { word: 'GREEN, WITH BRANCHES RED', colour: GOLD_700, urgent: false }
  return { word: 'ALL GREEN', colour: GREEN_700, urgent: false }
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/**
 * Every section of the report as label and lines, ONCE, so the plain text and
 * the HTML can never say different things. Nine sections, in the order
 * close-out UX4.1 lists them.
 */
export function sectionsFor(state) {
  const sections = []

  sections.push({
    title: 'Main',
    lines: [
      state.main?.conclusion === 'success'
        ? `Green at ${state.main.shortSha ?? 'unknown'}.`
        : state.main?.conclusion === 'failure'
          ? `RED at ${state.main.shortSha ?? 'unknown'}. Nothing new can deploy until it is green.`
          : `Not known: ${state.main?.reason ?? 'no CI run was found for the head of main'}.`,
      state.main?.runUrl ? `Run: ${state.main.runUrl}` : null,
    ].filter(Boolean),
  })

  sections.push({
    title: 'Production',
    lines: [
      state.production?.readyState
        ? `${state.production.readyState} and serving ${state.production.shortSha ?? 'an unknown commit'}, deployed ${humanAge(state.production.ageHours)} ago.`
        : `Not known: ${state.production?.reason ?? 'the deployment list could not be read'}.`,
      state.production?.url ? `Deployment: ${state.production.url}` : null,
    ].filter(Boolean),
  })

  const landed = state.landed ?? []
  sections.push({
    title: `Landed on main in 24 hours (${landed.length})`,
    lines: landed.length === 0 ? ['Nothing.'] : landed.map((c) => `${c.shortSha}  ${c.subject}`),
  })

  sections.push({
    title: 'When the build last pushed',
    lines: [
      state.lastPush?.when
        ? `${humanAge(state.stall?.hoursSincePush)} ago, to ${state.lastPush.ref ?? 'an unknown ref'}, at ${platformDate(state.lastPush.when)}.`
        : `No push to a working branch could be found, which is itself worth looking at${state.lastPush?.reason ? `: ${state.lastPush.reason}` : ''}.`,
      state.lastPush?.bookkeepingSkipped
        ? `${state.lastPush.bookkeepingSkipped} newer push(es) to ${BOOKKEEPING_REFS.join(', ')} were the build writing its own log, and do not count.`
        : null,
      state.stall?.stalled
        ? `THIS IS A STALL. ${state.stall.reason}.`
        : null,
    ].filter(Boolean),
  })

  const prs = state.openPullRequests ?? []
  sections.push({
    title: `Open pull requests (${prs.length})`,
    lines:
      prs.length === 0
        ? ['None.']
        : prs.map((p) => `#${p.number}  open ${humanAge(p.ageHours)}  ${p.draft ? '(draft) ' : ''}${p.title}`),
  })

  const failing = state.failingBranches ?? []
  sections.push({
    // UX4.5. A branch gate failure is ONE LINE HERE and no longer an email of
    // its own. The guard it caught is named, because F1.1 made the gate say it
    // and this is the reader that was worth saying it for.
    title: `Branches red in 24 hours (${failing.length})`,
    lines:
      failing.length === 0
        ? ['None.']
        : failing.map((b) => `${b.branch}  ${b.workflow}  ${b.guard ? `caught by ${b.guard}` : 'no guard named in the log'}  ${b.runUrl}`),
  })

  const biz = state.business ?? {}
  sections.push({
    title: 'The platform',
    lines: biz.error
      ? [`Not known: ${biz.error}.`]
      : [
          `${biz.eventsLive ?? 0} events live.`,
          `${biz.ticketsSold ?? 0} tickets sold in total, ${biz.ticketsSold24h ?? 0} of them in the last 24 hours.`,
          `${biz.ordersPaid24h ?? 0} paid orders in the last 24 hours.`,
          `${biz.newOrganisers24h ?? 0} new organisers in the last 24 hours.`,
        ],
  })

  return sections
}

/**
 * The whole message: one subject, one plain text body, one HTML body.
 *
 * The HTML is a single column at 640 pixels with no table layout and no
 * external asset, so it reads on a phone at 390 without a horizontal scroll and
 * survives an image-blocking client.
 */
export function renderStateReport(state) {
  const headline = headlineFor(state)
  const sections = sectionsFor(state)
  const when = platformDate(state.generatedAt)

  // The headline leads, because the subject is read in a list and the first
  // words are the only ones that always survive the truncation.
  const subject = `${headline.word}, ${when}`

  const text = [
    `EventLinqs daily state: ${headline.word}`,
    `Taken at ${when}.`,
    '',
    'This arrives every day whether or not anything is wrong. If it does not arrive,',
    'that is itself the alert: the thing that sends it has stopped.',
    '',
    ...sections.flatMap((section) => [section.title.toUpperCase(), ...section.lines.map((l) => `  ${l}`), '']),
  ].join('\n')

  const html = [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:${INK_900}">`,
    `  <div style="background:${INK_900};color:#ffffff;padding:20px 20px 18px 20px">`,
    `    <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD_400}">EventLinqs daily state</div>`,
    `    <div style="font-size:22px;font-weight:700;margin-top:6px">${escapeHtml(headline.word)}</div>`,
    `    <div style="font-size:13px;margin-top:6px;color:#C9CFD8">Taken at ${escapeHtml(when)}</div>`,
    '  </div>',
    `  <div style="background:${INK_100};padding:12px 20px;font-size:13px;line-height:1.5;color:${INK_600};border-bottom:1px solid ${INK_200}">`,
    '    This arrives every day whether or not anything is wrong. If it does not arrive, that is itself the alert: the thing that sends it has stopped.',
    '  </div>',
    ...sections.map((section) =>
      [
        `  <div style="padding:16px 20px;border-bottom:1px solid ${INK_200}">`,
        `    <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${GOLD_700};font-weight:700">${escapeHtml(section.title)}</div>`,
        ...section.lines.map(
          (line) => `    <div style="font-size:15px;line-height:1.5;margin-top:6px;word-break:break-word">${escapeHtml(line)}</div>`,
        ),
        '  </div>',
      ].join('\n'),
    ),
    `  <div style="padding:16px 20px;font-size:12px;color:${INK_600}">Runbook: docs/observability/state-report.md</div>`,
    '</div>',
  ].join('\n')

  return { subject, text, html, headline, sections }
}

/** The stall message, which is short on purpose: it is read on a phone. */
export function renderStallAlert(state) {
  const stall = state.stall ?? {}
  const lines = [
    `Nothing has been pushed to the repository for ${humanAge(stall.hoursSincePush)}.`,
    '',
    'A stall produces SILENCE, so no failure notification can ever detect it. That is',
    'why this message exists: it is the only thing that fires when nothing goes wrong',
    'and nothing goes right either.',
    '',
    state.lastPush?.when
      ? `Last push: ${state.lastPush.ref ?? 'unknown ref'} at ${platformDate(state.lastPush.when)}.`
      : 'No push to a working branch could be found at all.',
    state.lastPush?.bookkeepingSkipped
      ? `${state.lastPush.bookkeepingSkipped} newer push(es) to ${BOOKKEEPING_REFS.join(', ')} were the build writing its own log, and do not count.`
      : null,
    state.watchdog?.confirmed
      ? `The watchdog was confirmed running: ${state.watchdog.evidence}.`
      : `Whether the build is meant to be running could NOT be confirmed from here: ${state.watchdog?.evidence ?? 'this run had no way to see the watchdog'}. If the build is deliberately stopped, this line is the reason to ignore the rest.`,
    '',
    `This is band ${stall.band ?? 0}, so the next one cannot arrive for another ${STALL_THRESHOLD_HOURS} hours of silence.`,
  ]
  return {
    subject: `nothing pushed for ${humanAge(stall.hoursSincePush)}`,
    text: lines.join('\n'),
  }
}
