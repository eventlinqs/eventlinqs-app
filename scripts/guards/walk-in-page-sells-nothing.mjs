/**
 * GUARD: a free walk-in event page sells nothing and says so in no word but
 * "No ticket needed" (WI1, 21 October 2026).
 *
 * WI1-ITEM.md: "a blocking guard, proven red then green, that fails if a
 * walk-in event page renders a ticket selector, a price, or 'Get tickets'."
 * Lawal's rulings of 21 October 2026 set its reach: the word ban and the dollar
 * ban cover every line EventLinqs writes on the page (not the shared header,
 * footer or consent banner, and not text the organiser supplies), and the
 * structured data still carries offers.price 0 and isAccessibleForFree true.
 *
 * WHY THIS IS NEEDED, from the market itself: an Eventbrite listing for a free
 * festival reads "No RSVP. No tickets. No registration required." and still
 * carries a "Get tickets" button (docs/walk-in/LAW7-READING-2026-10-21.md). A
 * page that says no ticket while offering one is the failure this stops.
 *
 * FOUR CLAUSES.
 *   1. THE GRAPH. Following real value imports from the walk-in page, no ticket
 *      or price module is reachable: the ticket selector, the ticket panel, the
 *      "Get tickets" control, the sticky buy bar, the external, not-on-sale and
 *      sold-out panels, the seat selector, the shared price rule, the price
 *      history and the social-proof badge. The walk stops at the shared header
 *      and footer (ruling 1: chrome is outside the ban) and at 'use server'
 *      modules, which run on the server and render nothing.
 *   2. THE WORDS. Every string literal and piece of JSX text in the walk-in
 *      page's own files carries no "ticket" outside the four allowed phrases,
 *      no "book" word, no "Get tickets" and no dollar amount. Identifiers are
 *      not words on a page (`ticketTiers={[]}` is a prop name), so only
 *      literals and JSX text are read, with comments stripped.
 *   3. THE DISPATCH. src/app/events/[slug]/page.tsx sends a walk-in event to its
 *      own page BEFORE the first line that reads ticket types and before the
 *      first ticket component, so nothing on the ticketed page is ever computed
 *      for a walk-in event.
 *   4. THE STRUCTURED DATA. The real serialiser, run on a walk-in fixture,
 *      emits exactly one Offer at price 0 in AUD and isAccessibleForFree true,
 *      which this guard requires rather than counting as a price.
 *
 * Proven red then green by the drills in scripts/verify/guard-failure-drills.mjs.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildImportGraph } from './lib/import-graph.mjs'
import { stripJsComments } from './lib/strip-js-comments.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[walk-in-page-sells-nothing]'
const ROOT = process.cwd()

export const ENTRY = 'src/components/events/walk-in/walk-in-event-page'
export const ROUTE = 'src/app/events/[slug]/page.tsx'

/** Ruling 1: the shared chrome is outside the ban. The walk stops here. */
export const CHROME = new Set(['src/components/layout/site-header', 'src/components/layout/site-footer'])

/** Clause 1: what a walk-in page may never reach. Each must exist, or the list has gone stale. */
export const FORBIDDEN = [
  'src/components/checkout/ticket-selector',
  'src/components/features/events/ticket-panel-client',
  'src/components/features/events/get-tickets-cta',
  'src/components/features/events/sticky-action-bar',
  'src/components/events/external-tickets-panel',
  'src/components/features/events/tickets-not-on-sale',
  'src/components/features/events/event-sold-out',
  'src/components/checkout/seat-selector-lazy',
  'src/lib/events/price-label',
  'src/components/features/events/price-history-panel',
  'src/components/inventory/social-proof-badge',
]

/** Clause 2: the walk-in page's own files, whose every word is EventLinqs'. */
export const OWN_DIRS = ['src/components/events/walk-in', 'src/lib/walk-in']

/** The only phrases with "ticket" in them a walk-in page may use (src/lib/events/entry-mode.ts). */
export const ALLOWED_PHRASES = [
  'Free entry, no ticket needed',
  'Free, no ticket needed',
  'Free · No ticket needed',
  'No ticket needed',
]

/** The first lines on the ticketed page that read or build ticket things. */
export const TICKET_MARKERS = ['const allTiers', '<TicketPanelClient', '<GetTicketsCta', '<StickyActionBar', '<SeatSelectorLazy', 'ticketsOnSaleDetailed(']
export const DISPATCH = /if\s*\(\s*isWalkIn\(\s*event\s*\)\s*\)\s*return\s*<WalkInEventPage\b/

/** The import specifiers are paths, not words; drop the statements before reading. */
function withoutImports(code) {
  return code.replace(/^\s*(import|export)\s[^;]*?from\s+['"][^'"]+['"];?\s*$/gm, '').replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
}

/**
 * Every string literal and JSX text run in a source file, comments stripped.
 * A small scanner rather than a parser: quoted strings and template literal
 * text (the `${...}` holes are code, not words), plus text between a JSX `>`
 * and the next `<` or `{`.
 */
export function literalsOf(source) {
  const code = withoutImports(stripJsComments(source))
  const out = []
  let i = 0
  while (i < code.length) {
    const ch = code[i]
    if (ch === "'" || ch === '"') {
      let j = i + 1
      let s = ''
      while (j < code.length && code[j] !== ch) {
        if (code[j] === '\\') {
          s += code[j + 1] ?? ''
          j += 2
          continue
        }
        if (code[j] === '\n') break
        s += code[j++]
      }
      out.push(s)
      i = j + 1
      continue
    }
    if (ch === '`') {
      let j = i + 1
      let s = ''
      while (j < code.length && code[j] !== '`') {
        if (code[j] === '\\') {
          s += code[j + 1] ?? ''
          j += 2
          continue
        }
        if (code[j] === '$' && code[j + 1] === '{') {
          let depth = 1
          j += 2
          while (j < code.length && depth > 0) {
            if (code[j] === '{') depth++
            else if (code[j] === '}') depth--
            j++
          }
          s += ' '
          continue
        }
        s += code[j++]
      }
      out.push(s)
      i = j + 1
      continue
    }
    i++
  }
  // JSX text: between a tag's closing `>` and the next `<` or `{`.
  for (const m of code.matchAll(/>([^<>{}=;]*[A-Za-z$][^<>{}=;]*)(?=<|\{)/g)) {
    const text = m[1].trim()
    if (text) out.push(text)
  }
  return out
}

/** What is wrong with one piece of EventLinqs' own text on a walk-in page, or []. */
export function judgeText(text) {
  const problems = []
  let rest = text
  for (const phrase of ALLOWED_PHRASES) rest = rest.split(phrase).join(' ')
  if (/get\s+tickets?/i.test(text)) problems.push('"Get tickets"')
  else if (/\btickets?\b/i.test(rest) || /\bticketed\b/i.test(rest)) problems.push('the word "ticket"')
  if (/\bbook(s|ed|ing|ings)?\b/i.test(rest)) problems.push('a "book" word')
  if (/\$\s?\d/.test(text)) problems.push('a dollar amount')
  return problems
}

function walkFiles(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walkFiles(p))
    else if (/\.(ts|tsx)$/.test(name)) out.push(p.replaceAll('\\', '/'))
  }
  return out
}

/** Clause 1. Every module reachable from the entry, stopping at chrome and server actions. */
export function closureOf(graph, entry) {
  const seen = new Set()
  const stack = [entry]
  while (stack.length) {
    const mod = stack.pop()
    if (seen.has(mod)) continue
    seen.add(mod)
    if (CHROME.has(mod)) continue
    if (mod !== entry && graph.isServerAction.has(mod)) continue
    for (const next of graph.valueImports.get(mod) ?? []) stack.push(next)
  }
  return seen
}

/** Clause 3. Where the walk-in dispatch sits relative to the first ticket line. */
export function judgeDispatch(routeSource) {
  const code = stripJsComments(routeSource)
  const dispatch = code.search(DISPATCH)
  if (dispatch < 0) return [`${ROUTE} has no "if (isWalkIn(event)) return <WalkInEventPage" dispatch.`]
  const problems = []
  for (const marker of TICKET_MARKERS) {
    const at = code.indexOf(marker)
    if (at >= 0 && at < dispatch) {
      problems.push(`${ROUTE} reaches "${marker}" before it dispatches a walk-in event to its own page, so ticket work runs for an event that sells nothing.`)
    }
  }
  return problems
}

/** Clause 4. The real serialiser on a walk-in fixture, through the alias loader. */
function runSchema() {
  const script = `
    import { buildEventSchemaPayload } from '@/lib/seo/event-schema'
    const event = { id: 'g', slug: 'walk-in-guard', title: 'Walk-in guard night', status: 'published',
      entry_mode: 'walk_in', timezone: 'Australia/Melbourne', summary: 'A free night.', description: null,
      cover_image_url: 'https://cdn.example.com/c.avif', start_date: '2026-11-20T09:00:00Z',
      end_date: '2026-11-20T13:00:00Z', created_at: '2026-10-21T00:00:00Z', event_type: 'in_person',
      venue_name: 'Guard Hall', venue_address: '1 Guard St', venue_city: 'Geelong', venue_state: 'VIC',
      venue_postal_code: '3220', venue_country: 'AU', category: { slug: 'music', name: 'Music' } }
    const p = buildEventSchemaPayload({ event, organisation: { name: 'Guard', slug: 'guard', description: null },
      ticketTiers: [], state: 'upcoming', baseUrl: 'https://www.eventlinqs.com.au' })
    console.log(JSON.stringify(p))
  `
  const r = spawnSync(
    process.execPath,
    ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', script],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  )
  if (r.status !== 0) throw new Error(`the serialiser did not run: ${(r.stderr || r.stdout).trim().slice(0, 400)}`)
  const line = r.stdout.trim().split('\n').find((l) => l.startsWith('{'))
  if (!line) throw new Error(`the serialiser printed no payload: ${r.stdout.slice(0, 200)}`)
  return JSON.parse(line)
}

export function judgeSchema(payload) {
  const problems = []
  const offers = Array.isArray(payload?.offers) ? payload.offers : [payload?.offers].filter(Boolean)
  if (offers.length !== 1 || Number(offers[0]?.price) !== 0 || offers[0]?.priceCurrency !== 'AUD') {
    problems.push(`the structured data must carry exactly one Offer at price 0 in AUD; it carries ${JSON.stringify(payload?.offers ?? null).slice(0, 160)}`)
  }
  if (payload?.isAccessibleForFree !== true) problems.push('the structured data does not say isAccessibleForFree true')
  return problems
}

function main() {
  const problems = []

  // Clause 1.
  const graph = buildImportGraph(ROOT)
  if (!graph.valueImports.has(ENTRY)) {
    problems.push(`${ENTRY}.tsx does not exist, so there is no walk-in page to judge.`)
  }
  const missing = FORBIDDEN.filter((f) => !graph.valueImports.has(f))
  for (const f of missing) problems.push(`the forbidden list names ${f}, which no longer exists: the list has gone stale.`)
  const closure = closureOf(graph, ENTRY)
  for (const f of FORBIDDEN) {
    if (closure.has(f)) problems.push(`the walk-in page reaches ${f}. A walk-in page renders no ticket selector, price or "Get tickets".`)
  }

  // Clause 2.
  const files = OWN_DIRS.flatMap(walkFiles)
  let literals = 0
  for (const file of files) {
    for (const text of literalsOf(readFileSync(file, 'utf8'))) {
      literals++
      const found = judgeText(text)
      if (found.length) problems.push(`${file}: "${text.slice(0, 80)}" carries ${found.join(' and ')}.`)
    }
  }

  // Clause 3.
  problems.push(...judgeDispatch(readFileSync(ROUTE, 'utf8')))

  // Clause 4.
  let schemaJudged = 0
  try {
    problems.push(...judgeSchema(runSchema()))
    schemaJudged = 1
  } catch (error) {
    problems.push(`clause 4 could not run: ${error.message}`)
  }

  declareWork('walk-in-page-sells-nothing', {
    did: {
      'module reached from the walk-in page': closure.size,
      'walk-in source file': files.length,
      'literal judged': literals,
      'structured data payload': schemaJudged,
    },
    found: { problem: problems.length },
    zeroIsFine: { problem: true },
    exitOnZero: false,
  })

  if (problems.length > 0) {
    console.error(`${TAG} FAIL - ${problems.length} problem(s):`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exitCode = 1
    return
  }
  console.log(`${TAG} PASS - ${closure.size} modules reached, ${FORBIDDEN.length} forbidden ones absent, ${literals} literals clean, the dispatch comes first, and the structured data says free at price 0.`)
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('scripts/guards/walk-in-page-sells-nothing.mjs')) main()
