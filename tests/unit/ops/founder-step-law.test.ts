import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkExpected, parseExpect } from '../../../scripts/ops/apply-production-migrations.mjs'
import { asksForAGivenValue, EFFECTIVE, isFounderStep, judgeList, judgeNotes, judgeScripts, printsWhere, promptsForASecret, scriptsNamed, stampOf } from '../../../scripts/guards/lib/founder-steps.mjs'

/*
 * THE FOUNDER STEP LAW (Lawal, 12 November 2026, 01:16): "Fix this error in every other place ... make sure it doesn't
 * repeat itself ever." At 00:44 Lawal was handed `npm run migrate:production` in a folder that then moved; at 01:14 it
 * found 0 pending and did nothing. These are the refusals the PM named (item 2 (d)): wrong folder, missing migration,
 * extra migration; and the guard's rules over the notes and the list.
 */
const OURS = '20261111230001_growth_os_tasks.sql'
const where = { folder: 'C:\\dev\\EventLinqs\\wt-ticketmaster', branch: 'feat/photo-led-guide', commit: 'd045f345abcdef0123' }
const files = ['20261110020001_a.sql', '20261111010001_b.sql', OURS]
const applied = (...v: string[]) => new Set(v)

describe('migrate:production refuses unless exactly the expected migrations are pending', () => {
  it('passes only on the exact set', () => {
    const r = checkExpected({ expected: [OURS], pending: [{ file: OURS }], files, applied: applied('20261110020001', '20261111010001'), where })
    expect(r.ok).toBe(true)
  })
  it('WRONG FOLDER: the 01:14 case, a tree without the file, refuses and says where it is', () => {
    const r = checkExpected({ expected: [OURS], pending: [], files: files.slice(0, 2), applied: applied('20261110020001', '20261111010001'), where })
    expect(r.ok).toBe(false)
    const text = r.lines.join('\n')
    expect(text).toContain('NOT APPLIED')
    expect(text).toContain('C:\\dev\\EventLinqs\\wt-ticketmaster')
    expect(text).toContain('feat/photo-led-guide')
    expect(text).toContain('d045f345abcd')
    expect(text).toContain(`expected ${OURS}`)
    expect(text).toContain('does not have that file')
  })
  it('MISSING MIGRATION: an expected file already applied on production refuses, and says so', () => {
    const r = checkExpected({ expected: [OURS], pending: [], files, applied: applied('20261110020001', '20261111010001', '20261111230001'), where })
    expect(r.ok).toBe(false)
    expect(r.lines.join('\n')).toContain('production has already applied it')
  })
  it('EXTRA MIGRATION: a pending file the step did not expect refuses', () => {
    const r = checkExpected({ expected: [OURS], pending: [{ file: '20261111010001_b.sql' }, { file: OURS }], files, applied: applied('20261110020001'), where })
    expect(r.ok).toBe(false)
    expect(r.lines.join('\n')).toContain('20261111010001_b.sql is pending here but the step did not expect it')
  })
  it('NO --expect: nothing is applied on a step that did not say what it is for', () => {
    const r = checkExpected({ expected: null, pending: [{ file: OURS }], files, applied: applied(), where })
    expect(r.ok).toBe(false)
    expect(r.lines[0]).toContain('no --expect was given')
  })
  it('reads --expect as a list, comma separated, repeated or with =, file names only', () => {
    expect(parseExpect(['--expect', `${OURS},b.sql`])).toEqual([OURS, 'b.sql'])
    expect(parseExpect([`--expect=supabase/migrations/${OURS}`, '--expect', 'b.sql'])).toEqual([OURS, 'b.sql'])
    expect(parseExpect(['--dry-run'])).toBeNull()
  })
  it('in the script, where it runs is printed first, and the check stands before the ref is asked for', () => {
    const src = readFileSync(join(process.cwd(), 'scripts', 'ops', 'apply-production-migrations.mjs'), 'utf8').replace(/\r\n/g, '\n')
    const main = src.slice(src.indexOf('async function main()'))
    expect(main.indexOf('sayWhere(TAG, ROOT)')).toBeGreaterThan(-1)
    expect(main.indexOf('sayWhere(TAG, ROOT)')).toBeLessThan(main.indexOf('fetchAppliedMigrations'))
    expect(main.indexOf('checkExpected(')).toBeLessThan(main.indexOf('askLine('))
  })
})

describe('the guard: no founder step reaches Lawal unread', () => {
  const at = (hhmm: string) => `EL | 12 Nov 2026 ${hhmm} |`
  it('reads the stamp of both note shapes', () => {
    expect(stampOf('EL | 12 Nov 2026 01:18 | x')).toBe('2026-11-12 01:18')
    expect(stampOf('- 8 Nov 2026 06:02 | x')).toBe('2026-11-08 06:02')
    expect(EFFECTIVE).toBe('2026-11-12 01:16')
  })
  it('a founder step is an address to LAWAL (or FOUNDER STEP) that names something to run', () => {
    expect(isFounderStep('LAWAL, ONE STEP: in PowerShell run: cd C:\\dev\\EventLinqs\\wt-ticketmaster; npm run migrate:production')).toBe(true)
    expect(isFounderStep("Car B waits on Lawal's migration")).toBe(false)
    expect(isFounderStep('LAWAL, the samples are in C:\\dev\\START-16OCT')).toBe(false)
  })
  it('the 00:44 line, written after the law, fails twice: no READ BACK and no --expect', () => {
    const line = `${at('01:40')} LAWAL, ONE STEP: in PowerShell run: cd C:\\dev\\EventLinqs\\wt-ticketmaster; npm run migrate:production. It lists ONE migration.`
    const r = judgeNotes(line)
    expect(r.faults).toHaveLength(2)
    expect(r.faults[0]).toContain('no READ BACK')
    expect(r.faults[1]).toContain('no --expect')
  })
  it('passes with its read back and its --expect; a line before the law is history, not judged', () => {
    const ok = `${at('01:50')} LAWAL, ONE STEP: cd C:\\dev\\EventLinqs\\wt-ticketmaster; npm run migrate:production -- --expect ${OURS}. READ BACK 01:49: 1 pending, ${OURS}.`
    expect(judgeNotes(ok).faults).toEqual([])
    expect(judgeNotes(`EL | 12 Nov 2026 00:44 | LAWAL, ONE STEP: npm run migrate:production`).faults).toEqual([])
  })
  it('a read back is said in any case, never as "not read back" or "unread" (WINDOW 6\'s sweep of 12 November, 11:22)', () => {
    const step = `${at('11:22')} WINDOW 6, THE FOUNDER STEP LAW SWEPT for LAWAL: go-live.ps1 and npm run env:check`
    expect(judgeNotes(`${step}, every step read back beside each.`).faults).toEqual([])
    expect(judgeNotes(`${step}, not read back yet.`).faults).toHaveLength(1)
    expect(judgeNotes(`${step}, still unread.`).faults).toHaveLength(1)
    expect(judgeNotes(step).faults).toHaveLength(1)
  })
  it("judges only EventLinqs' own notes: a Bookedproof window's report in the shared file is its own gate's (the PM's 13:08)", () => {
    const words = "WINDOW 6, THE PM'S 11:06 (NOTHING OPENS ON LAWAL'S SCREEN): NOT WINDOW 6'S. the process running now is node scripts/verify/d2-stripe-drive.mjs --build"
    const theirs = judgeNotes(`- 13 Nov 2026 11:05 | ${words}`)
    expect(theirs.faults).toEqual([])
    expect(theirs.steps).toEqual([])
    expect(judgeNotes(`EL | 13 Nov 2026 11:05 | ${words}`).faults).toHaveLength(1)
  })
  it("every open row of Lawal's list carries READ BACK; the Removed section is history", () => {
    const list = ['| # | Click |', '|---|---|', '| 4 | Pay the invoice | READ BACK 01:55: open, US$110.03 |', '| 6 | Run npm run migrate:production |', '## Removed, with evidence', '| 9 | old |'].join('\n')
    const r = judgeList(list)
    expect(r.steps).toHaveLength(2)
    expect(r.faults.join('\n')).toContain('line 4: an open step with no READ BACK')
    expect(r.faults.join('\n')).toContain('no --expect')
  })
  it('a loader given to --import is not the step script; the script it loads is (13 November 2026)', () => {
    const npm = {
      'seo2:verify-property': 'node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/lib/src-alias-loader.mjs scripts/ops/search-console-verify.mjs',
    }
    const step = 'LAWAL: npm run seo2:verify-property -- --token <value> READ BACK'
    expect(scriptsNamed(step, npm)).toEqual(['scripts/ops/search-console-verify.mjs'])
    // Named on its own in a line, a loader is still judged: only its place after --import makes it a hook.
    expect(scriptsNamed('LAWAL: node scripts/lib/src-alias-loader.mjs READ BACK', npm)).toEqual(['scripts/lib/src-alias-loader.mjs'])
  })
  it('a script a founder step names must print where it runs', () => {
    const npm = { 'migrate:production': 'powershell -File scripts/ops/with-supabase-token.ps1 node scripts/ops/apply-production-migrations.mjs' }
    const step = `LAWAL: npm run migrate:production -- --expect ${OURS} READ BACK`
    expect(scriptsNamed(step, npm)).toEqual(['scripts/ops/apply-production-migrations.mjs'])
    const without = judgeScripts([step], npm, () => 'console.log(1)')
    expect(without.faults[0]).toContain('does not print where it runs')
    // A comment naming the helper is not printing where it runs (the guard's drill found this, 12 November 2026).
    const named = judgeScripts([step], npm, () => "// prints where it runs (scripts/lib/founder-where.mjs)\nimport { sayWhere } from '../lib/where.mjs'\nsayWhere(TAG)")
    expect(named.faults[0]).toContain('does not print where it runs')
    expect(printsWhere("import { sayWhere } from '../lib/founder-where.mjs'\nconst w = sayWhere(TAG, ROOT)")).toBe(true)
    expect(printsWhere("import { sayWhere } from '../lib/founder-where.mjs'\n")).toBe(false)
    const real = (rel: string) => { try { return readFileSync(join(process.cwd(), rel), 'utf8') } catch { return null } }
    expect(judgeScripts([step], npm, real).faults).toEqual([])
  })
})

/*
 * LAW 14 (hh) (the PM's 21:22 of 18 November 2026): no step asks Lawal for a key, token, password or secret he has already
 * given. The case: a script of 17 November asked him for the Blotato key he had stored, and on 18 November he had it open
 * again; and the list's Resend step asked him to set RESEND_API_KEY, which production already holds.
 */
describe('law 14 (hh): no founder step asks Lawal for a value he has already given', () => {
  const resend = "| 6 | Register Resend's delivery webhook | In PowerShell: `cd C:\\dev\\EventLinqs\\wt-design-full` then `$env:RESEND_API_KEY = '<your key from Resend, API Keys>'` then `node scripts/ops/register-resend-webhook.mjs --apply` | ... READ BACK 01:27 |"
  const blotato = 'EL | 18 Nov 2026 21:30 | LAWAL, ONE MINUTE: node scripts/ops/blotato-read.mjs, pasting the same key from Blotato, typing hidden. READ BACK 21:29'
  it('the Resend row and a Blotato key prompt are refused, red', () => {
    expect(asksForAGivenValue(resend)).toBe(true)
    expect(asksForAGivenValue(blotato)).toBe(true)
    expect(judgeList(`${resend}\n## Removed\n`).faults.some((f) => f.includes('law 14 (hh)'))).toBe(true)
    expect(judgeNotes(blotato).faults.some((f) => f.includes('law 14 (hh)'))).toBe(true)
  })
  it('a value only he can mint passes when the step says NEW VALUE; a step with no secret to type passes', () => {
    expect(asksForAGivenValue(`${resend.replace('|  ...', '| NEW VALUE: ...')} NEW VALUE`)).toBe(false)
    expect(asksForAGivenValue('| 31 | If a line reads 502, paste that line in the chat | READ BACK |')).toBe(false)
    expect(asksForAGivenValue('| 23 | Run lane1-approve-2.py, read them, then type APPROVE | READ BACK |')).toBe(false)
    expect(asksForAGivenValue("| 1 | You choose your own password from the link, sign in | READ BACK |")).toBe(false)
  })
  it('a note before the law is history; a list row is judged whatever its date', () => {
    expect(judgeNotes(blotato.replace('18 Nov 2026 21:30', '17 Nov 2026 20:25')).faults.some((f) => f.includes('law 14 (hh)'))).toBe(false)
  })
  it('a script a step names may prompt for a hidden value only where that step says NEW VALUE', () => {
    const npm = {}
    const hidden = "import { sayWhere } from '../lib/founder-where.mjs'\nsayWhere(TAG)\nprocess.stdin.setRawMode(true)"
    expect(promptsForASecret(hidden)).toBe(true)
    expect(promptsForASecret("import { sayWhere } from '../lib/founder-where.mjs'\nsayWhere(TAG)")).toBe(false)
    const step = 'LAWAL: node scripts/ops/store-token.mjs and paste the token when it asks. READ BACK 21:31'
    expect(judgeScripts([step], npm, () => hidden).faults[0]).toContain('law 14 (hh)')
    expect(judgeScripts([`${step} NEW VALUE: GitHub shows it once`], npm, () => hidden).faults).toEqual([])
  })
})
