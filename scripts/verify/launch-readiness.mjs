/**
 * THE LAUNCH READINESS REPORT. One row per L1 item, with its state, the evidence
 * and the date it was driven.
 *
 * Close-out L5, verbatim: "produce docs/verification/LAUNCH-READINESS.md: one row
 * per L1 item, with PASS or FAIL, the evidence path, and the date driven. Every
 * row PASS, or it is not launch ready."
 *
 * WHY THE REPORT IS GENERATED AND THE ADJUDICATION LIVES IN CODE. A hand-typed
 * readiness table is a claim about seventeen journeys, written once, that nothing
 * afterwards can contradict. Here the seventeen items are declared once, the state
 * of each is adjudicated against evidence that must still be on disk, and the
 * markdown is a rendering of that judgement rather than a second assertion able
 * to disagree with it. scripts/guards/launch-readiness-honest.mjs re-renders it
 * on every build and fails when the file and the judgement have parted company,
 * so the report cannot be edited into saying something the evidence does not.
 *
 * THE THREE STATES, and why OWNER BLOCKED is one of them even though L5 says
 * "PASS or FAIL". Close-out C10.4 already settled this shape for the scope audit:
 * "a section you cannot complete because it needs something only the owner can
 * supply is not PARTIAL and is not DEFERRED. Mark it OWNER BLOCKED, name exactly
 * what is needed in one sentence, and carry on." The same is true here, and the
 * distinction is not a softening: the report's overall verdict is NOT LAUNCH
 * READY while any row is not PASS, so an OWNER BLOCKED row blocks the launch
 * exactly as hard as a FAIL. What it adds is the one sentence that ENDS the
 * blocking, which a bare FAIL would hide.
 *
 *   PASS          driven, on production, with evidence that is still on disk.
 *   OWNER BLOCKED needs one thing only Lawal can supply, named in one sentence.
 *   FAIL          driven, and it did not work.
 *
 * WHAT MAKES A PASS ROW HONEST, enforced rather than promised:
 *   - it must cite at least one evidence path,
 *   - every path it cites must EXIST in this repository, so a citation cannot rot
 *     into a reference to something deleted,
 *   - it must carry the date it was driven,
 *   - and it must NOT also name something the owner has to supply, because that
 *     is the exact shape C10.4's roast caught: the need written into a note while
 *     the state beside it claimed the work was done.
 *
 * WHY THE EVIDENCE IS IN THE REPOSITORY AND NOT ONLY UNDER C:\dev\EVIDENCE. The
 * session evidence tree is on one laptop. A readiness report whose proof cannot
 * be re-read from a clone is a report nobody else can check, so the artefact each
 * PASS row rests on is committed here in compact form. The screenshots stay in
 * the session tree and are cited for the human reader, never as the thing the
 * guard checks.
 *
 * THE SIXTEEN ITEMS ARE QUOTED FROM C:\dev\CLOSE-OUT.md, section L1. That file is
 * outside this repository, so the wording is carried here verbatim and the
 * harness cross-checks itself against the source WHEN THE SOURCE IS PRESENT
 * (--check-source), which it is on the machine that runs the gate and is not in
 * CI. Enforced where it can be, and honest about where it cannot.
 *
 * Usage:
 *   node scripts/verify/launch-readiness.mjs                 # adjudicate, print
 *   node scripts/verify/launch-readiness.mjs --write         # write the markdown
 *   node scripts/verify/launch-readiness.mjs --check-source  # + compare to CLOSE-OUT.md
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const TAG = '[launch-readiness]'

export const REPORT_PATH = 'docs/verification/LAUNCH-READINESS.md'
export const EVIDENCE_DIR = 'docs/verification/launch-readiness'

/**
 * The date this adjudication was made. A constant rather than `new Date()` so the
 * rendered markdown is byte-stable, which is what lets the guard compare the file
 * on disk against a fresh render and call any difference a fault.
 */
export const GENERATED = '2026-09-09'

export const STATES = ['PASS', 'OWNER BLOCKED', 'FAIL']

/**
 * The things only Lawal can supply, each written once and referenced by key, so
 * twelve rows cannot drift into twelve slightly different sentences. Each is ONE
 * sentence, which the judgement below enforces.
 *
 * An entry no row cites is a FAULT, not a spare. That is the same anti-rot rule
 * the reviewed baseline in sourced-specifications.mjs and the parked record in
 * one-pull-request-at-a-time.mjs both carry: a list that can hold something
 * nothing points at is a list that stops being read. "Real event supply on
 * production" was in this map when it was written, blocking no row, and it was
 * removed rather than left here to look like a blocker: it is real, it matters
 * to discovery, and it lives in REVIEW-QUEUE.md where it is not pretending to
 * gate an L1 journey.
 */
/**
 * HOW MANY L1 JOURNEYS THERE ARE.
 *
 * Sixteen until 9 September 2026, when close-out UX2.5 added the seventeenth:
 * a HUMAN READ of the five launch screens. It is a real L1 item, not a note,
 * because the sweep that drove 211 routes with zero errors found NONE of the six
 * defects the owner found by reading one page - every one of those pages
 * answered 200.
 *
 * The count is a named constant so the bound and the rows cannot drift: adding a
 * row without moving this fails, and moving this without adding a row fails too.
 */
export const L1_ITEM_COUNT = 17

export const OWNER_NEEDS = {
  'test-account':
    'Approval to create one test organiser account and one test event on PRODUCTION, because every organiser journey below writes to the live database and L1 requires them driven there rather than on TEST.',
  'real-card':
    'Approval to put one real card through a low-price live event and refund it, because it is real money on the live Stripe account and no other path proves the buyer journey end to end.',
  'release-on-production':
    'Apply the pending migration with `npm run migrate:production`, because production is one migration behind this tree and until it lands the fixed release cannot reach production, so a read of the live screens reads the old code.',
}

/**
 * ONE ROW PER L1 ITEM, quoted verbatim from close-out L1.
 *
 * `drivenElsewhere` is informational and never supports a PASS: it records where
 * a journey HAS been proven, so the owner can see that an OWNER BLOCKED row means
 * "not yet driven on production" and not "never built or never tested".
 */
export const ITEMS = [
  {
    n: 1,
    group: 'ORGANISER',
    requirement: 'Sign up at /signup, verify email, sign in.',
    state: 'OWNER BLOCKED',
    needs: 'test-account',
    drivenElsewhere:
      'Driven end to end on TEST through the real signup form on a local production build (close-out C10-G1, 8 September 2026).',
  },
  {
    n: 2,
    group: 'ORGANISER',
    requirement:
      'Create an organisation, then create an event at /dashboard/events/create with a real venue address, and confirm coordinates are saved and NOT null.',
    state: 'OWNER BLOCKED',
    needs: 'test-account',
    drivenElsewhere:
      'Driven on TEST at 390, 768 and 1440 through the real create wizard, including the venue pick writing venue_geocode_source back (close-out C1 and C9).',
  },
  {
    n: 3,
    group: 'ORGANISER',
    requirement: 'Add tiers and pricing, add a discount code, publish.',
    state: 'OWNER BLOCKED',
    needs: 'test-account',
    drivenElsewhere:
      'Driven on TEST: tiers and pricing in the create wizard, the discount claim path in scripts/verify/discount-claim-drive.mjs, and add-ons in close-out C10-G2.',
  },
  {
    n: 4,
    group: 'ORGANISER',
    requirement:
      'The event appears on /events/[slug], on browse, on its city page, and on any community it belongs to.',
    state: 'PASS',
    driven: '2026-09-09',
    evidence: [`${EVIDENCE_DIR}/appearance-2026-09-09.json`],
    note:
      'Driven anonymously on production against a real published event, with the slug taken from the platform own sitemap and every onward page reached from links on the event page rather than from a typed URL. This row needs no write, which is why it is PASS while the rows around it are not.',
  },
  {
    n: 5,
    group: 'ORGANISER',
    requirement: 'Generate the Launch Kit and confirm every card renders with real ink.',
    state: 'OWNER BLOCKED',
    needs: 'test-account',
    drivenElsewhere:
      'Eighteen cards across six channels proven to be decodable JPEGs at their published sizes carrying real ink, from a running server (close-out C3, 6 September 2026).',
  },
  {
    n: 6,
    group: 'ORGANISER',
    requirement: 'Pause, unpause, archive, restore, and delete a zero-sales event.',
    state: 'OWNER BLOCKED',
    needs: 'test-account',
    drivenElsewhere:
      'The whole state machine driven on TEST at 390, 768 and 1440, including the 410 and 404 rules and the money-records delete refusal (close-out C13, docs/EVENT-LIFECYCLE.md).',
  },
  {
    n: 7,
    group: 'ORGANISER',
    requirement: 'View attendees, orders, and the GST report.',
    state: 'OWNER BLOCKED',
    needs: 'test-account',
    drivenElsewhere:
      'The three surfaces answer on production to an anonymous request with a redirect to login, which is the correct anonymous answer and is not the signed-in surface (route sweep, /dashboard/events/[id]/attendees, /orders, /dashboard/reports/gst).',
  },
  {
    n: 8,
    group: 'ATTENDEE',
    requirement: 'Find the event from the homepage without knowing the URL.',
    state: 'PASS',
    driven: '2026-09-09',
    evidence: [`${EVIDENCE_DIR}/discovery-2026-09-09.json`],
    note:
      'Driven anonymously on production at 390, 768 and 1440 by clicking only: the homepage was loaded, an event link was found on it and followed, and the page it reached was confirmed to be a real event page. No URL was typed after the homepage.',
  },
  {
    n: 9,
    group: 'ATTENDEE',
    requirement:
      'Buy a ticket end to end with a real card on a low-price test event, receive the confirmation email, and see the ticket at /account/tickets and /t/[code].',
    state: 'OWNER BLOCKED',
    needs: 'real-card',
    drivenElsewhere:
      'Driven end to end on TEST with Stripe test cards, including the webhook, the confirmation email and the bearer ticket (scripts/verify/paid-purchase-webhook-e2e.mjs, ticket-email-proof.mjs).',
  },
  {
    n: 10,
    group: 'ATTENDEE',
    requirement:
      'Refund that order from /dashboard/events/[id]/refunds and confirm the money returns and the ticket is voided.',
    state: 'OWNER BLOCKED',
    needs: 'real-card',
    drivenElsewhere:
      'Driven on TEST across the refund surfaces including the double-refund and orphan-inventory drills (scripts/verify/refund-dashboard-e2e.mjs, double-refund.mjs).',
  },
  {
    n: 11,
    group: 'ATTENDEE',
    requirement: 'Squad or group purchase path, and a waitlist join.',
    state: 'OWNER BLOCKED',
    needs: 'real-card',
    drivenElsewhere:
      'Driven on TEST: the squad path including expiry and the double-refund drill, and the waitlist bridge (scripts/verify/squad-expire-double-refund-drill.mjs, waitlist-bridge-e2e.mjs).',
  },
  {
    n: 12,
    group: 'DOOR',
    requirement:
      'Scan the issued ticket at /scan/[eventId]. It validates once and refuses the second time. Prove the offline path and the multi-scanner path.',
    state: 'OWNER BLOCKED',
    needs: 'real-card',
    drivenElsewhere:
      'Driven on TEST in full, including the offline IndexedDB path and two devices reconciling, which is build-brief B1 and B2 (scripts/verify/offline-door-schema-verify.mjs, door-realtime-verify.mjs).',
  },
  {
    n: 13,
    group: 'PAYOUT',
    requirement: 'The organiser payout path resolves and reports correctly at /dashboard/payouts.',
    state: 'OWNER BLOCKED',
    needs: 'test-account',
    drivenElsewhere:
      'Driven on TEST across the funds-holding model including reserve, refund and dispute (scripts/verify/payout-e2e.mjs, funds-holding-integrated.mjs).',
  },
  {
    n: 14,
    group: 'PLATFORM',
    requirement:
      'Every route enumerated from src/app returns its expected status on production. Zero unexpected 404s. Zero 500s anywhere.',
    state: 'PASS',
    driven: '2026-09-09',
    evidence: [`${EVIDENCE_DIR}/route-sweep-2026-09-09.json`],
    note:
      'Re-driven on the current release: 211 requests over 77 static pages, 55 dynamic pages, 48 static handlers and 12 dynamic handlers. No server error, no error boundary inside a 200, no soft 404, no undeliberate 404. Dynamic values came from the platform own sitemap and from anchors harvested off the pages the sweep already drives, never from a guess.',
  },
  {
    n: 15,
    group: 'PLATFORM',
    requirement: 'Every transactional and confirmation email actually sends and renders.',
    state: 'OWNER BLOCKED',
    needs: 'test-account',
    drivenElsewhere:
      'Rendered and sent on TEST across the transactional set; the production sender is configured and the post-deploy alert path was proven to deliver on 8 September 2026 (close-out H2.4).',
  },
  {
    n: 16,
    group: 'PLATFORM',
    requirement: 'axe-core zero on every public surface.',
    state: 'PASS',
    driven: '2026-09-09',
    evidence: [`${EVIDENCE_DIR}/axe-2026-09-09.json`],
    note:
      'Re-run on the current release across every public URL that answered 200 to an anonymous visitor, at 390 and 1440, at every impact level. The URL list was enumerated from the route sweep own results rather than typed.',
  },
  {
    // CLOSE-OUT UX2.5. This row exists because a sweep and a person do not see
    // the same page. On 9 September 2026 the route sweep drove 211 routes with
    // ZERO errors and found none of the six defects the owner found by reading
    // one page: a bio rendering `**MKL Studios**`, a venue name printed twice,
    // two tags differing only by case, a hero cropping the poster title, an
    // unlabelled map pin, and a rail closing into the footer with no gap.
    //
    // Every one of those is a 200. A status code cannot see any of them.
    //
    // THE FIVE SCREENS ARE NAMED HERE rather than left to interpretation,
    // because "the launch screens" is not defined anywhere else and a row whose
    // scope is a guess cannot be adjudicated.
    n: 17,
    group: 'PLATFORM',
    requirement:
      'A HUMAN READ of the five launch screens - the homepage, browse at /events, an event detail page, /pricing and /organisers - at 390, 768 and 1440. Read for what a status code cannot see: unrendered markup, duplicated text, invisible controls, and elements colliding. The route sweep is NEVER reported as covering this.',
    state: 'OWNER BLOCKED',
    needs: 'release-on-production',
    drivenElsewhere:
      'Read at 390, 768 and 1440 on a local production build of this tree, which is how the composed-cover crop defect was found while its own assertion was green (close-out UX1.4). It cannot be read on PRODUCTION as this release yet, because production is one migration behind and still serves the code that carries the six defects.',
  },
]

/**
 * Pure judgement, so every shape can be driven in a unit test without touching
 * the network or the disk. `evidenceExists` is injected for the same reason.
 *
 * The row type is declared rather than inferred from ITEMS. `typeof ITEMS`
 * describes ONE array of literal shapes, so a test could not hand this function
 * a row with a field the shipped adjudication happens not to use, and the tests
 * that matter are exactly the ones that hand it a malformed row.
 *
 * @typedef {object} ReadinessRow
 * @property {number} n
 * @property {string} [group]
 * @property {string} [requirement]
 * @property {string} [state]
 * @property {string[]} [evidence]
 * @property {string} [driven]
 * @property {string} [needs]
 * @property {string} [note]
 * @property {string} [drivenElsewhere]
 *
 * @param {object} input
 * @param {ReadinessRow[]} input.items
 * @param {(path: string) => boolean} input.evidenceExists
 * @param {Record<string,string>} [input.ownerNeeds]
 * @returns {{ faults: string[], counts: Record<string, number>, launchReady: boolean }}
 */
export function judgeLaunchReadiness({ items, evidenceExists, ownerNeeds = OWNER_NEEDS }) {
  const faults = []
  const seen = new Set()

  for (const item of items ?? []) {
    const at = `item ${item.n}`

    if (seen.has(item.n)) faults.push(`${at} appears more than once`)
    seen.add(item.n)

    if (!STATES.includes(item.state)) {
      faults.push(`${at} has state "${item.state}", which is not one of ${STATES.join(', ')}`)
      continue
    }

    if (!String(item.requirement ?? '').trim()) {
      faults.push(`${at} has no requirement text, so the row is about nothing`)
    }

    if (item.state === 'PASS') {
      const evidence = item.evidence ?? []
      if (evidence.length === 0) {
        faults.push(`${at} claims PASS and cites no evidence. A PASS with no artefact is an assertion.`)
      }
      for (const path of evidence) {
        if (!evidenceExists(path)) {
          faults.push(
            `${at} claims PASS and cites ${path}, which is not in the repository. ` +
              'A citation that rots into a reference to something deleted is worse than no citation.',
          )
        }
      }
      if (!String(item.driven ?? '').trim()) {
        faults.push(`${at} claims PASS and carries no date driven, which L5 asks for by name`)
      }
      if (item.needs) {
        faults.push(
          `${at} claims PASS and also names an owner need (${item.needs}). ` +
            'That is the shape close-out C10.4 caught: the blocker written into the row while the state beside it says the work is done.',
        )
      }
    }

    if (item.state === 'OWNER BLOCKED') {
      const need = item.needs ? ownerNeeds[item.needs] : null
      if (!item.needs) {
        faults.push(`${at} is OWNER BLOCKED and names no need. C10.4: name exactly what is needed, in one sentence.`)
      } else if (!need) {
        faults.push(`${at} is OWNER BLOCKED and names the need "${item.needs}", which is not in the reviewed list`)
      } else if (countSentences(need) !== 1) {
        faults.push(
          `${at} is OWNER BLOCKED and its need is ${countSentences(need)} sentences. C10.4 says one, because a paragraph is where a blocker goes to be ignored.`,
        )
      }
      if ((item.evidence ?? []).length > 0) {
        faults.push(`${at} is OWNER BLOCKED and cites evidence as if it were driven. Put it in drivenElsewhere instead.`)
      }
    }

    if (item.state === 'FAIL' && !String(item.note ?? '').trim()) {
      faults.push(`${at} is FAIL and says nothing about what failed`)
    }
  }

  const cited = new Set((items ?? []).map((i) => i.needs).filter(Boolean))
  for (const key of Object.keys(ownerNeeds)) {
    if (!cited.has(key)) {
      faults.push(
        `the owner need "${key}" is declared and no row cites it. ` +
          'Delete it: a reviewed list that can hold something nothing points at is a list that stops being read.',
      )
    }
  }

  for (let n = 1; n <= L1_ITEM_COUNT; n += 1) {
    if (!seen.has(n)) faults.push(`L1 item ${n} has no row. All ${L1_ITEM_COUNT} are adjudicated or the report is not the report.`)
  }
  for (const n of seen) {
    if (n < 1 || n > L1_ITEM_COUNT) faults.push(`item ${n} is outside L1, which has ${L1_ITEM_COUNT} items`)
  }

  const counts = {}
  for (const s of STATES) counts[s] = (items ?? []).filter((i) => i.state === s).length

  return { faults, counts, launchReady: counts.PASS === L1_ITEM_COUNT && faults.length === 0 }
}

/** One sentence means one terminating full stop, at the end. */
export function countSentences(text) {
  return String(text ?? '')
    .trim()
    .split(/\.(?:\s|$)/)
    .filter((s) => s.trim().length > 0).length
}

/**
 * Byte-stable rendering of the judgement. The guard re-renders and compares.
 *
 * @param {{ items?: ReadinessRow[], counts: Record<string, number>, launchReady: boolean, ownerNeeds?: Record<string,string> }} input
 */
export function renderMarkdown({ items = ITEMS, counts, launchReady, ownerNeeds = OWNER_NEEDS }) {
  const L = []
  L.push('# LAUNCH READINESS')
  L.push('')
  L.push(`Generated by \`scripts/verify/launch-readiness.mjs\` on ${GENERATED}. Do not hand-edit this file:`)
  L.push('`scripts/guards/launch-readiness-honest.mjs` re-renders it on every build and fails when the two disagree.')
  L.push('')
  L.push('Close-out L5: one row per L1 item, with its state, the evidence path and the date driven.')
  L.push('Every row PASS, or it is not launch ready.')
  L.push('')
  L.push(`## VERDICT: ${launchReady ? 'LAUNCH READY' : 'NOT LAUNCH READY'}`)
  L.push('')
  L.push(`${counts.PASS} of ${L1_ITEM_COUNT} rows PASS. ${counts['OWNER BLOCKED']} are OWNER BLOCKED. ${counts.FAIL} FAIL.`)
  L.push('')
  if (!launchReady) {
    L.push('An OWNER BLOCKED row blocks the launch exactly as hard as a FAIL. It is a separate state only')
    L.push('because it carries the one sentence that ends the blocking, which a bare FAIL would hide.')
    L.push('')
  }

  const blocked = items.filter((i) => i.state === 'OWNER BLOCKED')
  if (blocked.length > 0) {
    L.push('## What Lawal must supply, and what each unblocks')
    L.push('')
    L.push('| Need | Rows it unblocks |')
    L.push('|---|---|')
    for (const key of Object.keys(ownerNeeds)) {
      const rows = blocked.filter((i) => i.needs === key).map((i) => i.n)
      if (rows.length === 0) continue
      L.push(`| ${ownerNeeds[key]} | ${rows.join(', ')} |`)
    }
    L.push('')
  }

  L.push(`## The ${L1_ITEM_COUNT} rows`)
  L.push('')
  L.push('| # | Group | L1 requirement | State | Evidence | Driven |')
  L.push('|---|---|---|---|---|---|')
  for (const i of items) {
    const evidence = (i.evidence ?? []).map((p) => `\`${p}\``).join('<br>') || '-'
    L.push(
      `| ${i.n} | ${i.group} | ${i.requirement} | **${i.state}** | ${evidence} | ${i.driven ?? '-'} |`,
    )
  }
  L.push('')
  L.push('## Row by row')
  L.push('')
  for (const i of items) {
    L.push(`### ${i.n}. ${i.requirement}`)
    L.push('')
    L.push(`**${i.state}**`)
    L.push('')
    if (i.note) {
      L.push(i.note)
      L.push('')
    }
    if (i.needs) {
      L.push(`Needs: ${ownerNeeds[i.needs]}`)
      L.push('')
    }
    if (i.drivenElsewhere) {
      L.push(`Where it HAS been driven: ${i.drivenElsewhere}`)
      L.push('')
    }
  }
  /*
   * EVERY NUMBER IN THIS PARAGRAPH IS DERIVED, and it is derived because two of
   * them were not and one of those went stale.
   *
   * On 9 September 2026 this paragraph said the gap was "exactly three approvals
   * wide" while OWNER_NEEDS held TWO entries. The third had been removed when the
   * anti-rot rule found the list holding a need no row cited, and the prose was
   * not touched. That is precisely the shape this whole report exists to make
   * impossible: a sentence claiming something the adjudication does not say,
   * inside the one document the owner reads to decide whether the platform
   * launches. A hand-written count is a second place a claim can live.
   */
  const blockedRows = items.filter((i) => i.state === 'OWNER BLOCKED')
  const withDrivenElsewhere = blockedRows.filter((i) => i.drivenElsewhere).length
  const approvals = new Set(blockedRows.map((i) => i.needs).filter(Boolean)).size
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`
  L.push('## What this report does not claim')
  L.push('')
  L.push(
    `A row that is OWNER BLOCKED is not a row that was never built or never tested. ${plural(withDrivenElsewhere, 'of them carries', 'of them carry')}`,
  )
  L.push('a line saying where the journey HAS been driven, and in every case that is TEST or a local')
  L.push('production build rather than production. L1 asks for production, so production is what the state')
  L.push(
    `reflects. The gap is an approval, not an absence of work, and it is exactly ${plural(approvals, 'approval', 'approvals')} wide.`,
  )
  L.push('')
  return L.join('\n')
}

const invokedDirectly =
  process.argv[1] && /launch-readiness\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))

if (invokedDirectly) {
  const evidenceExists = (p) => existsSync(join(ROOT, p))
  const { faults, counts, launchReady } = judgeLaunchReadiness({ items: ITEMS, evidenceExists })

  console.log(`${TAG} ${L1_ITEM_COUNT} L1 items adjudicated: ${counts.PASS} PASS, ${counts['OWNER BLOCKED']} OWNER BLOCKED, ${counts.FAIL} FAIL`)
  for (const i of ITEMS) {
    console.log(`  ${String(i.n).padStart(2)}  ${i.state.padEnd(13)}  ${i.requirement.slice(0, 78)}`)
  }

  if (process.argv.includes('--check-source')) {
    const src = 'C:/dev/CLOSE-OUT.md'
    if (!existsSync(src)) {
      console.log(`${TAG} SKIP the source cross-check - ${src} is not on this machine, so the L1 wording is carried here unverified.`)
    } else {
      // Both sides are whitespace-normalised, because L1 wraps its longer items
      // across lines with indentation. Comparing raw text would report a
      // difference in line breaks as a difference in wording.
      const text = readFileSync(src, 'utf8').replace(/\s+/g, ' ')
      const missing = ITEMS.filter((i) => !text.includes(i.requirement.replace(/\s+/g, ' ')))
      if (missing.length > 0) {
        console.error(`${TAG} FAIL - ${missing.length} row(s) quote wording that is not in ${src}: ${missing.map((m) => m.n).join(', ')}`)
        process.exit(1)
      }
      console.log(`${TAG} source cross-check: all 16 requirement lines found verbatim in ${src}`)
    }
  }

  if (faults.length > 0) {
    console.error('')
    console.error(`${TAG} FAIL - ${faults.length} fault(s):`)
    for (const f of faults) console.error(`  ${f}`)
    process.exit(1)
  }

  if (process.argv.includes('--write')) {
    const md = renderMarkdown({ items: ITEMS, counts, launchReady })
    writeFileSync(join(ROOT, REPORT_PATH), md)
    console.log(`${TAG} wrote ${REPORT_PATH} (${md.length} bytes)`)
  }

  console.log(`${TAG} VERDICT: ${launchReady ? 'LAUNCH READY' : 'NOT LAUNCH READY'}`)
}
