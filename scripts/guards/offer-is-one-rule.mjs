/**
 * GUARD: THE ORGANISER OFFER IS ONE RULE, SAID ONE WAY, EVERYWHERE.
 *
 * LAW 24 as ruled, 26 September 2026 (founder ruling):
 *
 *   1. Every organiser gets six months with no platform fee, counted from the
 *      date they register on EventLinqs. No cap, no limit on places, no
 *      invitation needed.
 *   2. It applies to every organiser, including those who registered before
 *      20 September 2026, each from their own registration date.
 *   3. Referral months stay exactly as built: three fee free months for each
 *      organiser they refer who sells a ticket, on top of the six months.
 *   4. When the free months end, the standard fee applies.
 *   5. "Founding Organiser" stays as the name and badge, and every organiser
 *      receives it. It is never described as invite only, by invitation,
 *      limited, first come, or for a number of places.
 *   6. EventLinqs is national. No surface limits the offer or the platform to
 *      Geelong and Melbourne.
 *   7. The outreach drafts in docs/marketing are rewritten to this ruling now.
 *
 * "The offer lives in one module. A change to it is made there and nowhere
 * else, and the guard offer-is-one-rule fails the build anywhere it is restated
 * or contradicted."
 *
 * WHY. Until 26 September 2026 the offer was stated in about thirty places: the
 * organiser page, the invite landing, three emails, the waitlist, the admin
 * screens, the forecast, the organiser agreement, docs/PRICING.md, four
 * marketing drafts and a spreadsheet. The first LAW 24 ruling (20 September)
 * changed the engine and a handful of them, and the rest went on promising the
 * first fifty organisers in Geelong and Melbourne, a founding-spots countdown,
 * and a programme that was "invite-only", because prose is not executed.
 *
 * THE MODULE is src/lib/payments/founding-waiver.ts: FOUNDING_INITIAL_MONTHS,
 * FOUNDING_REFERRAL_MONTHS, FOUNDING_BADGE_NAME, FOUNDING_OFFER_SCOPE and the
 * one wording, FOUNDING_TERMS. It is the file
 * founding-offer-matches-configuration.mjs already reads, and clause 5 below
 * holds the two guards to the same file.
 *
 * WHAT IT CHECKS.
 *
 *   1. RENDERED, NEVER TYPED, IN src. Every page, email, SMS, legal page, admin
 *      and dashboard surface is rendered from src/, so there the offer is a
 *      READ: any month claim typed into a string ("6 months fee-free", "three
 *      more months") fails, whatever number it states, because a typed copy is
 *      a second definition that agrees today and drifts tomorrow. Comments are
 *      stripped first: a comment recording what the offer USED to say is
 *      history, and nobody is shown it.
 *   2. AGREES, IN WHAT CANNOT RENDER. docs/PRICING.md, docs/marketing (every
 *      .md, and every cell of the outreach spreadsheet) and docs/legal are
 *      static; each month claim they make must equal the module's number, and
 *      docs/PRICING.md must carry both figures in its terms table.
 *   3. NONE OF THE RETIRED WORDS, in the offer's context, on any scanned
 *      surface: first 50, 50 founding, founding spots or places, a limited
 *      number of places, limited spots, spots left or remaining, invite only,
 *      by invitation, invitation only, first come, a "standard organiser"
 *      beside a founding one; and Geelong and Melbourne in a sentence that
 *      limits the offer or the platform to them.
 *   4. NO RETIRED BUSINESS NAME in the documents. src, public and supabase are
 *      the jurisdiction of no-retired-business-name.mjs; the documents are not
 *      read by it, so they are read here.
 *   5. THE TWO GUARDS AGREE: founding-offer-matches-configuration.mjs names the
 *      same module, and run-guards.mjs registers both.
 *
 * THE REGISTER, and why it is not a pattern. Some records must stay exactly as
 * written: an applied migration is what production ran, a dated review records
 * what was drafted on its date. Each is named below by FILE and RULE, with the
 * exact number of findings it may hold and the reason. One more finding in the
 * same file fails; one fewer fails too, as rot, so the register cannot outlive
 * the record it excuses.
 *
 * ON THE BUILD HOST. Vercel strips docs/marketing and docs/legal from the upload
 * (.vercelignore); docs/PRICING.md is re-included. A stripped root is reported
 * NOT JUDGED, by the shared determination in lib/stripped-or-deleted.mjs,
 * never skipped in silence, and a root that is missing anywhere else FAILS,
 * because there it was deleted. The local gate and CI judge every root.
 *
 * Run: node scripts/guards/offer-is-one-rule.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { stripJsComments } from './lib/strip-js-comments.mjs'
import { stateOf } from './lib/stripped-or-deleted.mjs'
import { RETIRED } from './no-retired-business-name.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TAG = '[offer-is-one-rule]'

export const MODULE = 'src/lib/payments/founding-waiver.ts'
const SIBLING = 'scripts/guards/founding-offer-matches-configuration.mjs'
const RUNNER = 'scripts/guards/run-guards.mjs'

/* ------------------------------------------------------------- the module */

/** The offer, read out of the one module. Null fields are reported, never guessed. */
export function readModule(root = ROOT) {
  const file = join(root, MODULE)
  if (!existsSync(file)) return null
  const source = readFileSync(file, 'utf8')
  const num = (name) => {
    const m = source.match(new RegExp(String.raw`export const ${name}\s*=\s*(\d+)`))
    return m ? Number(m[1]) : null
  }
  const str = (name) => {
    const m = source.match(new RegExp(String.raw`export const ${name}\s*=\s*'([^']+)'`))
    return m ? m[1] : null
  }
  return {
    initial: num('FOUNDING_INITIAL_MONTHS'),
    referral: num('FOUNDING_REFERRAL_MONTHS'),
    badge: str('FOUNDING_BADGE_NAME'),
    scope: str('FOUNDING_OFFER_SCOPE'),
    hasTerms: /export const FOUNDING_TERMS\s*=/.test(source),
  }
}

/* ------------------------------------------------------------ the phrases */

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}
const NUM = String.raw`(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`
const toNumber = (token) => (/^\d+$/.test(token) ? Number(token) : WORD_NUMBERS[token.toLowerCase()])

/** Month claims that state the REFERRAL grant. */
const REFERRAL_CLAIMS = [
  new RegExp(String.raw`\b${NUM}\s+(?:more|extra|further|additional)\s+(?:fee[- ]free\s+|free\s+)?months?\b`, 'gi'),
  new RegExp(String.raw`\b(?:adds?|extend(?:s|ed|able)?(?:\s+it)?\s+by(?:\s+a\s+further)?)\s+${NUM}\s+(?:more\s+)?(?:fee[- ]free\s+)?months?\b`, 'gi'),
]

/** Month claims that state the INITIAL grant. */
const INITIAL_CLAIMS = [
  new RegExp(String.raw`\b${NUM}\s+months?\s+(?:completely\s+)?(?:fee[- ]free|free|with no platform fee|of zero|no platform fee|zero (?:platform )?fees?)\b`, 'gi'),
  new RegExp(String.raw`\b(?:zero|no)\s+(?:platform\s+)?fees?\s+for\s+(?:the\s+first\s+|your\s+first\s+|their\s+first\s+)?${NUM}\s+months?\b`, 'gi'),
  new RegExp(String.raw`\bfirst\s+${NUM}\s+months\b`, 'gi'),
  new RegExp(String.raw`\b${NUM}\s+months\s+(?:from|counted from)\s+(?:the\s+)?(?:day|date)\b`, 'gi'),
]

/** Words that put a line in the offer's context. */
const OFFER_CONTEXT = /\b(founding|fee[- ]free|free months?|months? free|no platform fees?|zero (?:platform )?fees?|platform fees?|offer|spots?|places|waiver|referr\w*|organisers?)\b/i

/** Phrase rules, judged on a line in the offer's context. */
export const PHRASES = [
  { id: 'first-50', re: /\bfirst\s+(?:50|fifty)\b/i, why: 'limits the offer to a first fifty' },
  { id: '50-founding', re: /\b(?:50|fifty)\s+founding\b/i, why: 'counts founding organisers to fifty' },
  { id: 'founding-spots', re: /\bfounding\s+(?:organiser\s+)?(?:spots?|places?)\b/i, why: 'makes the offer a number of places' },
  { id: 'limited-places', re: /\blimited\s+number\s+of\s+(?:places|spots)\b/i, why: 'limits the number of places' },
  { id: 'limited-spots', re: /\blimited\s+(?:spots|places)\b/i, why: 'limits the number of places' },
  { id: 'spots-left', re: /\bspots?\s+(?:left|remaining|remain)\b|\bremaining\s+spots?\b/i, why: 'counts places down' },
  { id: 'invite-only', re: /\binvite[- ]only\b/i, why: 'says the offer needs an invitation' },
  { id: 'by-invitation', re: /\bby\s+invitation\b/i, why: 'says the offer needs an invitation' },
  { id: 'invitation-only', re: /\binvitation[- ]only\b/i, why: 'says the offer needs an invitation' },
  { id: 'first-come', re: /\bfirst[- ]come\b/i, why: 'makes the offer first come' },
  { id: 'standard-organiser', re: /\bstandard organisers?\b|\bnon[- ]founding organisers?\b/i, why: 'says some organisers are not Founding Organisers' },
]

/** Geelong and Melbourne, and a word that limits something to them. */
const GEO = /\bGeelong\s*(?:and|\+|&|\/|or)\s*Melbourne\b/i
const GEO_LIMIT = /\b(launch\w*|starting|only|first|capped|limited|limits?|opening|concentrat\w*|founding|fee-free|offer|spots?|places)\b/i

/**
 * Judges one unit of text (a line, or a spreadsheet cell).
 *
 * @param {{ text: string, before?: string, after?: string }} unit
 * @param {{ initial: number, referral: number }} terms
 * @param {'rendered' | 'static'} kind  rendered: any typed month claim fails;
 *        static: a month claim must equal the module.
 * @returns {{ rule: string, why: string, match: string }[]}
 */
export function judgeUnit(unit, terms, kind) {
  const findings = []
  const { text } = unit
  const context = `${unit.before ?? ''} ${text} ${unit.after ?? ''}`
  const inContext = OFFER_CONTEXT.test(context)

  if (inContext) {
    for (const phrase of PHRASES) {
      const m = text.match(phrase.re)
      if (m) findings.push({ rule: phrase.id, why: phrase.why, match: m[0] })
    }

    const claims = []
    for (const re of REFERRAL_CLAIMS) for (const m of text.matchAll(re)) claims.push({ m, expected: terms.referral, what: 'referral' })
    for (const re of INITIAL_CLAIMS) for (const m of text.matchAll(re)) claims.push({ m, expected: terms.initial, what: 'initial' })
    for (const { m, expected, what } of claims) {
      const stated = toNumber(m[1])
      if (kind === 'rendered') {
        findings.push({
          rule: 'typed-month-claim',
          why: `types the ${what} months instead of rendering them from ${MODULE}`,
          match: m[0],
        })
      } else if (stated !== expected) {
        findings.push({
          rule: `${what}-months-disagree`,
          why: `states ${stated} for the ${what} months, and ${MODULE} says ${expected}`,
          match: m[0],
        })
      }
    }
  }

  for (const sentence of text.split(/(?<=[.;!?])\s+/)) {
    const g = sentence.match(GEO)
    if (!g) continue
    const limit = sentence.match(GEO_LIMIT)
    if (limit) {
      findings.push({
        rule: 'geelong-and-melbourne',
        why: `limits the offer or the platform to Geelong and Melbourne ("${limit[0]}" in the same sentence). EventLinqs is national`,
        match: g[0],
      })
    }
  }
  return findings
}

/* ------------------------------------------------------------- the files */

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.vercel', 'coverage', '.turbo'])
const CODE_EXT = /\.(ts|tsx|mjs|js|jsx)$/i
const PUBLIC_EXT = /\.(txt|md|json|xml|html|webmanifest)$/i
const DOC_EXT = /\.(md|mdx|txt|csv)$/i
const SHEET_EXT = /\.xlsx$/i
const MAX_BYTES = 2 * 1024 * 1024

/**
 * The surfaces a person reads, by kind. src is the running product; supabase
 * holds seeded wording and applied migrations; the three document roots are the
 * copy the founder pastes and the authority document.
 */
export const ROOTS = [
  { path: 'src', kind: 'rendered', ext: CODE_EXT, strip: 'js' },
  { path: 'public', kind: 'static', ext: PUBLIC_EXT },
  { path: 'supabase', kind: 'static', ext: /\.sql$/i, strip: 'sql' },
  { path: 'docs/PRICING.md', kind: 'static', ext: DOC_EXT, docs: true },
  { path: 'docs/marketing', kind: 'static', ext: DOC_EXT, sheets: true, docs: true },
  { path: 'docs/legal', kind: 'static', ext: DOC_EXT, docs: true },
]

/** The module defines the offer; it is the one file allowed to state it. */
const DEFINES = new Set([MODULE])

/**
 * THE REGISTER. Exact counts per file and rule; one more or one fewer fails.
 */
const APPLIED =
  'Applied migration: production has run it, and this line is a COMMENT ON string it set, so editing the file ' +
  'would make it disagree with what ran. The live column or function comment it created still says it; restating ' +
  'that comment is a new migration, which is the founder\'s to apply, and is listed in the PLATFORM-FIX-2 result.'

export const REGISTER = [
  { file: 'supabase/migrations/20260709000001_launch_kit.sql', rule: 'geelong-and-melbourne', count: 1, reason: APPLIED },
  { file: 'supabase/migrations/20260710000002_founding_network.sql', rule: 'first-50', count: 1, reason: APPLIED },
  { file: 'supabase/migrations/20260710000002_founding_network.sql', rule: '50-founding', count: 1, reason: APPLIED },
  { file: 'supabase/migrations/20260710000002_founding_network.sql', rule: 'founding-spots', count: 2, reason: APPLIED },
  { file: 'supabase/migrations/20260727000002_founding_fee_free_window.sql', rule: 'first-50', count: 1, reason: APPLIED },
  { file: 'supabase/migrations/20260823000001_founding_invites_nationwide.sql', rule: 'first-50', count: 1, reason: APPLIED },
  { file: 'supabase/migrations/20260823000001_founding_invites_nationwide.sql', rule: 'founding-spots', count: 1, reason: APPLIED },
  { file: 'supabase/migrations/20260920000050_a_founding_invite_is_spent_once.sql', rule: 'founding-spots', count: 1, reason: APPLIED },
  {
    file: 'src/lib/founding/invites.ts',
    rule: 'geelong-and-melbourne',
    count: 1,
    reason:
      'An operator diagnostic, returned only when a database still carries the two-city CHECK constraint of ' +
      '20260710000002 because migration 20260823000001 has not been applied to it. It describes the database it ' +
      'is talking to and names the migration that fixes it; it is not a statement of the offer.',
  },
  {
    file: 'docs/legal/LEGAL-REVIEW-SUMMARY.md',
    rule: 'first-50',
    count: 1,
    reason:
      'Dated review record (24 July 2026): item 5 records the terms that were drafted and sent for legal review. ' +
      'Kept as written because it is the record of what the reviewer was asked; the SUPERSEDED note of ' +
      '26 September 2026 directly beneath it states the ruling and asks for the item to be re-issued.',
  },
  {
    file: 'docs/legal/LEGAL-REVIEW-SUMMARY.md',
    rule: 'geelong-and-melbourne',
    count: 1,
    reason: 'The same sentence of the same dated review record (item 5), kept as written for the same reason.',
  },
]

function walk(rel, root, out) {
  const abs = join(ROOT, rel)
  let st
  try {
    st = statSync(abs)
  } catch {
    return
  }
  if (st.isFile()) {
    if ((root.ext.test(rel) || (root.sheets && SHEET_EXT.test(rel))) && st.size <= MAX_BYTES) out.push(rel)
    return
  }
  for (const entry of readdirSync(abs)) {
    if (SKIP_DIRS.has(entry)) continue
    walk(`${rel}/${entry}`, root, out)
  }
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => {
      // A -- outside a quoted string starts a comment.
      let inQuote = false
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] === "'") inQuote = !inQuote
        else if (!inQuote && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i)
      }
      return line
    })
    .join('\n')
}

async function sheetUnits(rel) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(join(ROOT, rel))
  const units = []
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        const value = cell.value
        const text =
          typeof value === 'string'
            ? value
            : value && typeof value === 'object' && Array.isArray(value.richText)
              ? value.richText.map((r) => r.text).join('')
              : null
        if (text) units.push({ where: `${sheet.name}!${cell.address}`, text })
      })
    })
  })
  return units
}

/* ------------------------------------------------------------------ main */

async function main() {
  const faults = []
  const notJudged = []
  const did = {
    'surface file read': 0,
    'line judged': 0,
    'spreadsheet cell judged': 0,
    'register entry held': 0,
    'agreement check': 0,
  }

  const terms = readModule()
  if (!terms) {
    faults.push(`${MODULE} is missing, so the offer has no definition to hold anything to`)
  } else {
    for (const [field, value] of Object.entries(terms)) {
      if (value === null || value === false) faults.push(`${MODULE} no longer defines ${field}; every surface renders it from there`)
    }
  }
  const t = { initial: terms?.initial ?? NaN, referral: terms?.referral ?? NaN }

  /** file -> rule -> findings */
  const byFile = new Map()
  const record = (file, where, finding, text) => {
    if (!byFile.has(file)) byFile.set(file, [])
    byFile.get(file).push({ where, ...finding, text: text.trim().slice(0, 170) })
  }

  for (const root of ROOTS) {
    if (!existsSync(join(ROOT, root.path))) {
      const state = stateOf(root.path, { root: ROOT })
      if (state.state === 'stripped') {
        notJudged.push(`${root.path}: ${state.why}`)
        continue
      }
      faults.push(`${root.path} is missing (${state.why}); a surface that states the offer cannot be judged by its absence`)
      continue
    }
    const files = []
    walk(root.path, root, files)
    if (files.length === 0 && root.docs) {
      // VERCEL DELETES THE FILES AND LEAVES THE DIRECTORY STANDING, so an empty
      // root is the build host's shape too, and "the directory exists" decides
      // nothing (lib/stripped-or-deleted.mjs records the deployment that cost).
      // The shared determination is asked about a path UNDER the root instead:
      // excluded and on Vercel is stripped, anything else is a deletion.
      const state = stateOf(`${root.path}/offer-is-one-rule.probe`, { root: ROOT })
      if (state.state === 'stripped') {
        notJudged.push(`${root.path}: its files ${state.why.replace(/^\.vercelignore excludes it/, '.vercelignore excludes them')}`)
        continue
      }
      faults.push(`${root.path} holds no file this guard reads (${state.why}); a surface that states the offer cannot be judged by its absence`)
      continue
    }
    for (const rel of files) {
      if (DEFINES.has(rel)) continue
      did['surface file read'] += 1
      if (SHEET_EXT.test(rel)) {
        for (const cell of await sheetUnits(rel)) {
          did['spreadsheet cell judged'] += 1
          for (const f of judgeUnit({ text: cell.text }, t, root.kind)) record(rel, cell.where, f, cell.text)
        }
        continue
      }
      let text = readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
      if (root.strip === 'js') text = stripJsComments(text)
      if (root.strip === 'sql') text = stripSqlComments(text)
      const lines = text.split('\n')
      if (root.docs) {
        // A DOCUMENT IS JUDGED BY PARAGRAPH, because prose is soft-wrapped: the
        // first run read the legal review line by line and missed "capped at the
        // first 50 organisers across Geelong and" + "Melbourne" entirely. A
        // paragraph is the sentence's real extent; its first line is the address.
        // A heading or a list item starts a unit of its own, so a heading that
        // names "the offer" is never read as the context of the quote under it.
        const opensUnit = (line) => /^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)/.test(line)
        let start = -1
        for (let i = 0; i <= lines.length; i += 1) {
          const blank = i === lines.length || !lines[i].trim()
          if (!blank && start !== -1 && opensUnit(lines[i]) && !(/^\s*>/.test(lines[i]) && /^\s*>/.test(lines[i - 1]))) {
            const paragraph = lines.slice(start, i).map((l) => l.trim()).join(' ')
            did['line judged'] += i - start
            for (const f of judgeUnit({ text: paragraph }, t, root.kind)) record(rel, `${start + 1}`, f, paragraph)
            start = -1
          }
          if (!blank && start === -1) start = i
          if (blank && start !== -1) {
            const paragraph = lines.slice(start, i).map((l) => l.trim()).join(' ')
            did['line judged'] += i - start
            for (const f of judgeUnit({ text: paragraph }, t, root.kind)) record(rel, `${start + 1}`, f, paragraph)
            start = -1
          }
        }
      } else {
        lines.forEach((line, i) => {
          if (!line.trim()) return
          did['line judged'] += 1
          const findings = judgeUnit({ text: line, before: lines[i - 1], after: lines[i + 1] }, t, root.kind)
          for (const f of findings) record(rel, `${i + 1}`, f, line)
        })
      }
      if (root.docs) {
        for (const retired of RETIRED) {
          for (const re of retired.res) {
            re.lastIndex = 0
            const m = text.match(re)
            if (m) record(rel, 'file', { rule: 'retired-business-name', why: `names ${retired.name}, a retired business name`, match: m[0] }, m[0])
          }
        }
      }
    }
  }

  /* docs/PRICING.md must carry both figures in its terms table (so the check
   * cannot pass by the table being deleted). */
  if (existsSync(join(ROOT, 'docs/PRICING.md'))) {
    const pricing = readFileSync(join(ROOT, 'docs/PRICING.md'), 'utf8')
    const initial = pricing.match(/^\|\s*Initial grant\s*\|\s*(\d+)\s+months/m)
    const referral = pricing.match(/^\|\s*Per confirmed referral\s*\|\s*plus\s+(\d+)\s+months/m)
    did['agreement check'] += 2
    if (!initial) faults.push('docs/PRICING.md no longer states the initial grant in its terms table ("| Initial grant | N months")')
    else if (Number(initial[1]) !== t.initial) faults.push(`docs/PRICING.md states an initial grant of ${initial[1]} months; ${MODULE} says ${t.initial}`)
    if (!referral) faults.push('docs/PRICING.md no longer states the referral grant in its terms table ("| Per confirmed referral | plus N months")')
    else if (Number(referral[1]) !== t.referral) faults.push(`docs/PRICING.md states a referral grant of ${referral[1]} months; ${MODULE} says ${t.referral}`)
  } else {
    const state = stateOf('docs/PRICING.md', { root: ROOT })
    if (state.state === 'stripped') notJudged.push(`docs/PRICING.md terms table: ${state.why}`)
  }

  /* The register: exact counts, both directions. */
  const excused = new Set()
  for (const entry of REGISTER) {
    did['register entry held'] += 1
    const hits = (byFile.get(entry.file) ?? []).filter((f) => f.rule === entry.rule)
    const rootOf = ROOTS.find((r) => entry.file === r.path || entry.file.startsWith(`${r.path}/`))
    if (hits.length === 0 && rootOf && !existsSync(join(ROOT, entry.file)) && stateOf(entry.file, { root: ROOT }).state === 'stripped') {
      continue
    }
    if (hits.length !== entry.count) {
      faults.push(
        `the register holds ${entry.file} [${entry.rule}] at exactly ${entry.count}, and it now carries ${hits.length}. ` +
          (hits.length > entry.count
            ? 'A registered record excuses what it held, never a new sentence.'
            : 'The record changed; correct the register, so an excuse cannot outlive what it excused.'),
      )
      continue
    }
    for (const h of hits) excused.add(h)
  }

  /* 5. The two guards agree. */
  const sibling = existsSync(join(ROOT, SIBLING)) ? readFileSync(join(ROOT, SIBLING), 'utf8') : null
  did['agreement check'] += 1
  if (!sibling) {
    faults.push(`${SIBLING} is missing. It holds the engine and the landing band to the module, and it stays`)
  } else {
    const named = sibling.match(/const WAIVER = '([^']+)'/)
    if (!named || named[1] !== MODULE) {
      faults.push(`${SIBLING} reads ${named ? named[1] : 'no module'} as the configuration, and this guard reads ${MODULE}. The two must hold the offer to the same file`)
    }
  }
  const runner = existsSync(join(ROOT, RUNNER)) ? readFileSync(join(ROOT, RUNNER), 'utf8') : ''
  did['agreement check'] += 1
  for (const guard of [SIBLING, 'scripts/guards/offer-is-one-rule.mjs']) {
    if (!runner.includes(`'${guard}'`)) faults.push(`${RUNNER} does not register ${guard}, so the build never runs it`)
  }

  const findings = []
  for (const [file, list] of byFile) for (const f of list) if (!excused.has(f)) findings.push({ file, ...f })

  const ok = declareWork('offer-is-one-rule', {
    did,
    found: { 'statement that disagrees with the offer': findings.length, 'structural fault': faults.length },
    zeroIsFine: { 'spreadsheet cell judged': notJudged.length > 0 ? 'docs/marketing was stripped from this upload' : undefined },
    exitOnZero: false,
  })
  if (!ok) faults.push('the guard counted no work, so it cannot pass')

  console.log(`${TAG} the offer: ${t.initial} months from registration, ${t.referral} per referral who sells a ticket, "${terms?.badge}" for every organiser, national (${terms?.scope}), from ${MODULE}`)
  for (const n of notJudged) console.log(`${TAG} NOT JUDGED [docs-stripped] ${n}`)
  if (REGISTER.length > 0) {
    console.log(`${TAG} the register, ${REGISTER.length} record(s) held at an exact count:`)
    for (const e of REGISTER) console.log(`${TAG}   ${e.file} [${e.rule}] x${e.count}: ${e.reason}`)
  }

  if (findings.length > 0 || faults.length > 0) {
    console.error(`${TAG} FAIL: ${findings.length} statement(s) restate or contradict the offer, ${faults.length} structural fault(s).`)
    for (const f of findings) {
      console.error(`${TAG}   ${f.file}:${f.where} [${f.rule}] ${f.why}`)
      console.error(`${TAG}       "${f.match}" in: ${f.text}`)
    }
    for (const fault of faults) console.error(`${TAG}   - ${fault}`)
    console.error(
      `${TAG} The offer lives in ${MODULE}. In src, render FOUNDING_TERMS or the constants; in a document, ` +
        'state the ruling as written. A record that must stay as written goes in the REGISTER with its reason.',
    )
    process.exitCode = 1
    return
  }
  console.log(`${TAG} PASS - every surface a person reads states the offer as the module holds it, and none restates or contradicts it.`)
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) await main()
