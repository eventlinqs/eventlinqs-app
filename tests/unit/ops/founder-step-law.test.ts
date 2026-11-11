import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkExpected, parseExpect } from '../../../scripts/ops/apply-production-migrations.mjs'
import { EFFECTIVE, isFounderStep, judgeList, judgeNotes, judgeScripts, scriptsNamed, stampOf } from '../../../scripts/guards/lib/founder-steps.mjs'

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
  it("every open row of Lawal's list carries READ BACK; the Removed section is history", () => {
    const list = ['| # | Click |', '|---|---|', '| 4 | Pay the invoice | READ BACK 01:55: open, US$110.03 |', '| 6 | Run npm run migrate:production |', '## Removed, with evidence', '| 9 | old |'].join('\n')
    const r = judgeList(list)
    expect(r.steps).toHaveLength(2)
    expect(r.faults.join('\n')).toContain('line 4: an open step with no READ BACK')
    expect(r.faults.join('\n')).toContain('no --expect')
  })
  it('a script a founder step names must print where it runs', () => {
    const npm = { 'migrate:production': 'powershell -File scripts/ops/with-supabase-token.ps1 node scripts/ops/apply-production-migrations.mjs' }
    const step = `LAWAL: npm run migrate:production -- --expect ${OURS} READ BACK`
    expect(scriptsNamed(step, npm)).toEqual(['scripts/ops/apply-production-migrations.mjs'])
    const without = judgeScripts([step], npm, () => 'console.log(1)')
    expect(without.faults[0]).toContain('does not print where it runs')
    const real = (rel: string) => { try { return readFileSync(join(process.cwd(), rel), 'utf8') } catch { return null } }
    expect(judgeScripts([step], npm, real).faults).toEqual([])
  })
})
