import { describe, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  CAPABILITIES,
  CAPABILITY_NAMES,
  describeUse,
  scanBuildTimeScripts,
  strippedTopLevels,
  usedBy,
  usesInFile,
} from '../../../scripts/guards/lib/build-host.mjs'
import { DECLARED } from '../../../scripts/guards/lib/build-host-needs.mjs'

/**
 * THE VERCEL BUILD HOST IS NOT A DEVELOPER MACHINE. Close-out F2.1.
 *
 * Five deployments have been lost to one class that had been named too narrowly
 * as "docs get stripped". Four were docs; the fifth was `git ls-files` on a host
 * whose `.git` the same ignore file empties, and no docs-shaped guard could see
 * it coming.
 *
 * These tests build real trees on disk rather than mocking the filesystem,
 * because the thing under test is what a scan of real files reports, and the two
 * defects it has already had - a prose match counted as a dependence, and a bare
 * `Error:` line that never matched - were both cases of the code disagreeing
 * with reality rather than with an assertion.
 */

/** A throwaway repository with a .vercelignore and whatever files a test needs. */
function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'build-host-'))
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

const IGNORE = ['docs', 'research', '.git', ''].join('\n')

describe('the three capabilities', () => {
  test('are docs, git and token, and each says what the build host lacks', () => {
    expect(CAPABILITY_NAMES).toEqual(['docs', 'git', 'token'])
    for (const name of CAPABILITY_NAMES) {
      expect(CAPABILITIES[name as keyof typeof CAPABILITIES].length).toBeGreaterThan(20)
    }
  })

  test('.git is NOT reported as a docs top level, because the reader next step differs', () => {
    const root = fixture({ '.vercelignore': IGNORE })
    const stripped = strippedTopLevels(root)
    expect(stripped.has('docs')).toBe(true)
    expect(stripped.has('research')).toBe(true)
    // Excluded by the same file, by the same mechanism, but a script naming a
    // path inside it has a GIT dependence. Reporting it as docs would send the
    // reader to re-include something that must stay excluded.
    expect(stripped.has('.git')).toBe(false)
  })
})

describe('usesInFile', () => {
  const root = fixture({ '.vercelignore': IGNORE })
  const stripped = strippedTopLevels(root)

  const scan = (body: string) => {
    writeFileSync(join(root, 'subject.mjs'), body)
    return usesInFile(root, 'subject.mjs', stripped)
  }

  test('a spawner called with git is a git dependence, whichever spawner spelled it', () => {
    for (const spawner of ['spawnSync', 'execFileSync', 'execSync', 'exec', 'spawn', 'execFile']) {
      const found = scan(`${spawner}('git', ['status'])\n`)
      expect(found.map((f) => f.capability)).toContain('git')
    }
  })

  test('the WORD git in prose is not a dependence, or every guard here would declare one', () => {
    // Verbatim shape from no-inherited-git-env.mjs, which was reported as needing
    // git because its header quotes the exact call site it forbids.
    const found = scan(
      ['/**', " * the offending line is an ordinary `spawnSync('git', ..., { cwd })`", ' */', 'const x = 1', ''].join(
        '\n',
      ),
    )
    expect(found).toEqual([])
  })

  test('a path under a stripped top level is a docs dependence', () => {
    const found = scan("const P = 'docs/PRICING.md'\n")
    expect(found).toEqual([{ capability: 'docs', evidence: 'docs/PRICING.md', line: 1 }])
  })

  test('a stripped path named only in a comment is not a dependence', () => {
    // The shape from one-fee-copy.mjs, whose comment names docs/marketing on the
    // line above the constant that actually reads it.
    const found = scan(['/**', ' * `docs/marketing` is the copy the founder pastes into a post.', ' */', ''].join('\n'))
    expect(found).toEqual([])
  })

  test('a path under src/ is no dependence at all, stripped or not', () => {
    expect(scan("const P = 'src/lib/health/pricing-lock.mjs'\n")).toEqual([])
  })

  test('a _TOKEN environment read is a token dependence, named', () => {
    const found = scan('const t = process.env.VERCEL_TOKEN\n')
    expect(found).toEqual([{ capability: 'token', evidence: 'VERCEL_TOKEN', line: 1 }])
  })

  test('a token name nobody has written down yet is still caught, because the shape is the rule', () => {
    const found = scan('const t = process.env.SOME_FUTURE_SERVICE_TOKEN\n')
    expect(found.map((f) => f.evidence)).toEqual(['SOME_FUTURE_SERVICE_TOKEN'])
  })

  test('an ordinary environment variable is not a token', () => {
    expect(scan('const u = process.env.NEXT_PUBLIC_SUPABASE_URL\n')).toEqual([])
  })
})

describe('usedBy follows imports, which is how the fourth failure stayed invisible', () => {
  test('a dependence in an imported module is attributed to the file that holds it', () => {
    const root = fixture({
      '.vercelignore': IGNORE,
      'scripts/guards/entry.mjs': "import { read } from './lib/reader.mjs'\nread()\n",
      'scripts/guards/lib/reader.mjs': "export const REPORT = 'docs/verification/LAUNCH-READINESS.md'\nexport const read = () => REPORT\n",
    })
    const uses = usedBy(root, 'scripts/guards/entry.mjs', strippedTopLevels(root))
    expect(uses.docs).toHaveLength(1)
    expect(uses.docs[0].file).toBe('scripts/guards/lib/reader.mjs')
    // A scan that read only the entry point would report nothing here, and that
    // is precisely what made docs/verification/LAUNCH-READINESS.md invisible.
    expect(usesInFile(root, 'scripts/guards/entry.mjs', strippedTopLevels(root))).toEqual([])
  })

  test('describeUse points at the file and line, so the reader goes straight to it', () => {
    expect(describeUse('git', { file: 'a/b.mjs', evidence: "execFileSync('git'", line: 12 })).toBe(
      "git: a/b.mjs:12  execFileSync('git'",
    )
  })
})

describe('the registry and this repository, judged together', () => {
  const scanned = scanBuildTimeScripts(process.cwd())

  test('every entry point that uses a capability declares it', () => {
    const undeclared: string[] = []
    for (const { entry, uses } of scanned) {
      const declared = Object.keys(DECLARED[entry] ?? {})
      for (const capability of Object.keys(uses)) {
        if (!declared.includes(capability)) undeclared.push(`${entry} uses ${capability}`)
      }
    }
    expect(undeclared).toEqual([])
  })

  test('nothing is declared that the code does not use, so the registry cannot rot', () => {
    const stale: string[] = []
    const onDisk = new Map(scanned.map((s) => [s.entry, Object.keys(s.uses)]))
    for (const [entry, needs] of Object.entries(DECLARED)) {
      const used = onDisk.get(entry)
      if (!used) {
        stale.push(`${entry} is declared and is not a prebuild entry point`)
        continue
      }
      for (const capability of Object.keys(needs)) {
        if (!used.includes(capability)) stale.push(`${entry} declares ${capability} and does not use it`)
      }
    }
    expect(stale).toEqual([])
  })

  test('every declared reason is a sentence, not a placeholder', () => {
    for (const [entry, needs] of Object.entries(DECLARED)) {
      for (const [capability, why] of Object.entries(needs)) {
        expect(typeof why, `${entry}.${capability}`).toBe('string')
        expect(why.length, `${entry}.${capability}`).toBeGreaterThan(30)
      }
    }
  })

  test('the five deployments this exists for are all represented in the registry', () => {
    // Four docs and one git, so a future edit that empties one kind is visible.
    const kinds = new Set(Object.values(DECLARED).flatMap((n) => Object.keys(n)))
    expect([...kinds].sort()).toEqual(['docs', 'git', 'token'])
    expect(DECLARED['scripts/check-pricing-lock.mjs']?.docs).toBeDefined()
    expect(DECLARED['scripts/guards/community-layer-protected.mjs']?.docs).toBeDefined()
    expect(DECLARED['scripts/guards/launch-readiness-honest.mjs']?.docs).toBeDefined()
    expect(DECLARED['scripts/guards/excluded-reads-survive-the-upload.mjs']?.git).toBeDefined()
  })
})
