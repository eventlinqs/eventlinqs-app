import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/*
 * THE GUARD law37-only, PLANTED EACH WAY (law 37 as revised by Lawal, 23 November 2026, 13:41, CREATIVE-POLICY-LAW37-REVISED-
 * 23NOV.md: original EventLinqs artwork is a first class format, and in the one pipeline it is only ever an approved file).
 * The guard reads five files of src; each case copies them into a scratch tree, plants one change, and runs the guard there.
 */
const ROOT = process.cwd()
const GUARD = join(ROOT, 'scripts', 'guards', 'law37-only.mjs')
const READ = ['src/lib/social/law37.ts', 'src/lib/social/piece-quality.ts', 'src/lib/social/store.ts', 'src/lib/broadcast/campaign-slides.tsx', 'src/lib/broadcast/law37-photo.tsx']
const scratch: string[] = []
afterAll(() => {
  for (const d of scratch) rmSync(d, { recursive: true, force: true })
})

function runPlanted(plant: (law: string) => string): { code: number | null; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'law37-only-'))
  scratch.push(dir)
  for (const f of READ) {
    mkdirSync(dirname(join(dir, f)), { recursive: true })
    cpSync(join(ROOT, f), join(dir, f))
  }
  const law = join(dir, READ[0])
  const before = readFileSync(law, 'utf8')
  const after = plant(before)
  writeFileSync(law, after)
  const run = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' })
  return { code: run.status, out: `${run.stdout}${run.stderr}` }
}

const ADMITS_FILE = "return s.t === DESIGNED_ARTWORK_SLIDE && typeof s.url === 'string' && isApprovedFileUrl(s.url)"
const ADMITS_PHOTO = 'if (s.t === LAW37_SLIDE) return true'

describe('law37-only, planted each way', () => {
  it('passes the tree as it stands: designed artwork, an approved file, posts beside the photograph', () => {
    const run = runPlanted((law) => {
      expect(law).toContain(ADMITS_FILE)
      return law
    })
    expect(run.out).toContain('[law37-only] PASS')
    expect(run.code).toBe(0)
  })

  it('fails when an older drawn family is let back in beside them', () => {
    const run = runPlanted((law) => law.replace(ADMITS_PHOTO, "if (s.t === LAW37_SLIDE || s.t === 'ask') return true"))
    expect(run.code).toBe(1)
    expect(run.out).toContain('admits an earlier drawn family (ask)')
  })

  it('fails when designed artwork passes without being an approved file at its own address', () => {
    const run = runPlanted((law) => law.replace(ADMITS_FILE, 'return s.t === DESIGNED_ARTWORK_SLIDE'))
    expect(run.code).toBe(1)
    expect(run.out).toContain('without being an approved file at its own address')
  })

  it('fails when the refusal no longer reads the policy format at all', () => {
    const run = runPlanted((law) => law.replace('.filter(({ s }) => !inPolicyFormat(s))', '.filter(() => false)'))
    expect(run.code).toBe(1)
    expect(run.out).toContain("no longer refuses every slide outside the policy's format")
  })
})
