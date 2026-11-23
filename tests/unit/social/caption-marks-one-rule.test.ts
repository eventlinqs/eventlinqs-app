import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLAYBOOK } from '@/lib/social/playbook'
import { describe, expect, it } from 'vitest'
import { exclamationCount } from '@/lib/social/caption-marks'

/*
 * ONE RULE FOR THE MARKS, THE DATABASE'S AND THE CODE'S (the PM's intake read of 23 November 2026, 22:15): the comedy
 * weekend set was refused on production by social_piece_revisions_caption_check, which refused every '!', while the code
 * (caption-marks.ts exclamationCount) keeps a '!' written for a letter inside a word ('Holy Sh!t Improv'). This reads each
 * check as the migrations leave it, newest first, evaluates its patterns (POSIX [:alpha:] read as a Unicode letter), and
 * holds it to the code's rule on a table of cases. On main the caption check is the inline one of 20261028141001, which
 * refuses 'Holy Sh!t Improv'.
 */

const DIR = join(process.cwd(), 'supabase', 'migrations')
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
const sqlOf = (f: string) => readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n')

/** The check as the migrations leave it: the newest file naming it, else the column's inline check where it was made. */
function checkOf(name: string, column: string, madeIn: string): string {
  for (const f of [...files].reverse()) {
    const sql = sqlOf(f)
    const at = sql.indexOf(`add constraint ${name}`)
    if (at >= 0) return sql.slice(at, sql.indexOf(';', at))
  }
  const sql = sqlOf(madeIn)
  const line = sql.split('\n').find((l) => new RegExp(`^\\s*${column} text\\b.*\\bcheck\\b`).test(l))
  if (!line) throw new Error(`no inline check for ${column} in ${madeIn}`)
  return line
}

/** Each pattern a check refuses on (column !~ pattern), evaluated: a quoted literal, or literals and chr(n) joined by ||. */
function patternsOf(check: string, column: string): RegExp[] {
  const out: RegExp[] = []
  const expr = new RegExp(`\\b${column}\\s*!~\\s*(\\((?:'(?:[^']|'')*'|chr\\(\\d+\\)|\\s|\\|\\|)+\\)|'(?:[^']|'')*')`, 'g')
  for (const m of check.matchAll(expr)) {
    const parts = [...m[1].matchAll(/'((?:[^']|'')*)'|chr\((\d+)\)/g)].map((p) => (p[2] ? String.fromCharCode(Number(p[2])) : p[1].replace(/''/g, "'")))
    out.push(new RegExp(parts.join('').replace(/\[:alpha:\]/g, '\\p{L}'), 'u'))
  }
  return out
}

const keptByCheck = (patterns: readonly RegExp[], words: string) => patterns.every((p) => !p.test(words))
const keptByCode = (words: string) => !/[\u2013\u2014]/.test(words) && exclamationCount(words) === 0

const CASES: readonly [string, boolean][] = [
  ['Holy Sh!t Improv', true],
  ['Fri 27 Nov, 5 pm: Holy Sh!t Improv', true],
  ['A night out, all welcome.', true],
  ['Great night!', false],
  ['Wow! Tickets', false],
  ['!', false],
  ['!Wow', false],
  ['Sh!!t', false],
  ['A night \u2013 out', false],
  ['A night \u2014 out', false],
]

const CHECKS = [
  { name: 'social_piece_revisions_caption_check', column: 'caption', madeIn: '20261028141001_social_campaigns.sql' },
  { name: 'social_image_requests_message_check', column: 'message', madeIn: '20261028141001_social_campaigns.sql' },
  { name: 'social_report_decisions_recommendation_check', column: 'recommendation', madeIn: '20261028151001_social_measurement.sql' },
]

describe("the database's marks rule is the code's", () => {
  for (const c of CHECKS) {
    it(`${c.name} keeps and refuses exactly what the code does`, () => {
      const patterns = patternsOf(checkOf(c.name, c.column, c.madeIn), c.column)
      expect(patterns.length, c.name).toBeGreaterThan(0)
      for (const [words, kept] of CASES) {
        expect(keptByCode(words), `the code on "${words}"`).toBe(kept)
        expect(keptByCheck(patterns, words), `${c.name} on "${words}"`).toBe(kept)
      }
    })
  }

  it('the migration that makes it holds the same table in its own post-conditions', () => {
    const sql = sqlOf('20261124000001_caption_marks_one_rule.sql')
    for (const [words, kept] of CASES.filter(([w]) => !/[\u2013\u2014]/.test(w))) {
      expect(sql, words).toContain(`('${words.replace(/'/g, "''")}', ${kept})`)
    }
  })
})

describe("its playbook rule (Lawal's 16:04: every return is a fix, a test that fails first, and a rule)", () => {
  it('is written down with its reason and its source', () => {
    for (const id of ['database-caption-marks-one-rule']) {
      const rule = PLAYBOOK.find((r) => r.id === id)
      expect(rule, id).toBeDefined()
      expect(rule?.source, id).toContain("the PM's intake read of 23 November 2026, 22:15")
    }
  })
})
