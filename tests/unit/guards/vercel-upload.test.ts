import { describe, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { makeJudgeIgnored, parseVercelIgnore } from '../../../scripts/guards/lib/vercelignore.mjs'
import {
  holdsNoFile,
  isGitCheckout,
  listTrackedFiles,
  materialiseVercelUpload,
  removeUpload,
} from '../../../scripts/guards/lib/vercel-upload.mjs'
import { REQUIRED_READS, TOLERANT_FILES } from '../../../scripts/guards/lib/vercelignore-registry.mjs'
import { gitEnv } from '../../../scripts/lib/git-env.mjs'

/**
 * THE SHAPE OF THE TREE VERCEL BUILDS IN, PROVEN RATHER THAN ASSUMED.
 *
 * Four deployments have now been lost to one mistake: reasoning about the
 * .vercelignore upload from a comment instead of from the thing itself. The
 * fourth, on 8 September 2026, was the belief that an ignored DIRECTORY does not
 * arrive on the build host. It arrives. Vercel deletes the matched FILES and
 * leaves the directory tree, which its own build log for that deployment says
 * plainly: .vercelignore names `.git`, and the removal enumerated /.git/config,
 * /.git/description and the hook samples inside it.
 *
 * So the first group of tests below is about the MECHANISM, not the guard: given
 * an ignore file and a set of tracked paths, what does the materialised tree
 * look like. The empty-directory case is the one that cost the deployment and it
 * is asserted directly.
 *
 * The second group is the discriminator the guards now use to tell the build
 * host from a developer machine, because "the directory is missing" was the
 * wrong test and something had to replace it.
 *
 * Nothing here touches the repository tree. Every fixture is a throwaway
 * directory under the OS temp directory, built from paths given by name, so no
 * test depends on what happens to be committed today.
 */

const ROOT = join(__dirname, '..', '..', '..')

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'vercel-upload-test-'))
}

function writeTree(root: string, files: Record<string, string>) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, body, 'utf8')
  }
}

describe('the .vercelignore grammar', () => {
  test('a bare name matches that segment at any depth, as gitignore does', () => {
    const { rules, errors } = parseVercelIgnore('research\n')
    expect(errors).toEqual([])
    const judge = makeJudgeIgnored(rules)
    expect(judge('research/a.md').ignored).toBe(true)
    expect(judge('src/research/a.md').ignored).toBe(true)
    expect(judge('src/researcher/a.md').ignored).toBe(false)
  })

  test('a file inside an excluded directory can never be re-included, and the reason names the ancestor', () => {
    const { rules } = parseVercelIgnore('docs/*\n!docs/security/CREDENTIAL-ROTATION.md\n')
    const judge = makeJudgeIgnored(rules)
    const verdict = judge('docs/security/CREDENTIAL-ROTATION.md')
    expect(verdict.ignored).toBe(true)
    expect(verdict.by).toContain('docs/security/')
  })

  test('walking each level down is what actually re-includes it', () => {
    const { rules } = parseVercelIgnore(
      'docs/*\n!docs/security/\ndocs/security/*\n!docs/security/CREDENTIAL-ROTATION.md\n',
    )
    const judge = makeJudgeIgnored(rules)
    expect(judge('docs/security/CREDENTIAL-ROTATION.md').ignored).toBe(false)
    expect(judge('docs/security/OTHER.md').ignored).toBe(true)
    expect(judge('docs/PRICING.md').ignored).toBe(true)
  })

  test('a file directly under an excluded parent is re-includable without a walk-down', () => {
    const { rules } = parseVercelIgnore('docs/*\n!docs/PRICING.md\n')
    expect(makeJudgeIgnored(rules)('docs/PRICING.md').ignored).toBe(false)
  })

  test('comments and blank lines are not rules', () => {
    const { rules, errors } = parseVercelIgnore('# docs/*\n\n   \n')
    expect(errors).toEqual([])
    expect(rules).toHaveLength(0)
  })

  test('a pattern outside the grammar is REFUSED, never guessed at', () => {
    for (const pattern of ['docs/**/x.md', 'docs/[ab].md', 'docs/?.md', 'docs/{a,b}.md', 'do*cs/x.md']) {
      const { errors } = parseVercelIgnore(`${pattern}\n`)
      expect(errors, pattern).toHaveLength(1)
    }
  })

  test('the repository .vercelignore parses with no refusals', () => {
    const { errors } = parseVercelIgnore(
      execFileSync('git', ['show', 'HEAD:.vercelignore'], { cwd: ROOT, encoding: 'utf8', env: gitEnv() }),
    )
    expect(errors).toEqual([])
  })
})

describe('materialising the upload', () => {
  test('an ignored file is stripped and its DIRECTORY is left standing, which is the defect that cost the deployment', () => {
    const root = scratch()
    const dest = scratch()
    try {
      writeTree(root, {
        '.vercelignore': 'docs/*\n!docs/PRICING.md\n',
        'docs/PRICING.md': 'kept',
        'docs/verification/LAUNCH-READINESS.md': 'stripped',
        'src/app.ts': 'code',
      })
      const shape = materialiseVercelUpload({
        root,
        dest,
        files: ['.vercelignore', 'docs/PRICING.md', 'docs/verification/LAUNCH-READINESS.md', 'src/app.ts'],
        linkNodeModules: false,
      })

      expect(existsSync(join(dest, 'docs/verification'))).toBe(true)
      expect(existsSync(join(dest, 'docs/verification/LAUNCH-READINESS.md'))).toBe(false)
      expect(existsSync(join(dest, 'docs/PRICING.md'))).toBe(true)
      expect(existsSync(join(dest, 'src/app.ts'))).toBe(true)
      expect(shape.kept).toBe(3)
      expect(shape.stripped).toBe(1)
      expect(shape.ignoreErrors).toEqual([])
    } finally {
      removeUpload(root)
      removeUpload(dest)
    }
  })

  test('a kept file arrives with its real contents', () => {
    const root = scratch()
    const dest = scratch()
    try {
      writeTree(root, { '.vercelignore': 'docs/*\n', 'src/a.ts': 'the real bytes' })
      materialiseVercelUpload({ root, dest, files: ['.vercelignore', 'src/a.ts'], linkNodeModules: false })
      expect(execFileSync('node', ['-p', 'require("fs").readFileSync(process.argv[1],"utf8")', join(dest, 'src/a.ts')], {
        encoding: 'utf8',
      }).trim()).toBe('the real bytes')
    } finally {
      removeUpload(root)
      removeUpload(dest)
    }
  })

  test('removeUpload refuses a path that is a real repository', () => {
    const root = scratch()
    try {
      mkdirSync(join(root, '.git'), { recursive: true })
      expect(() => removeUpload(root)).toThrow(/refusing to remove/)
    } finally {
      // Remove the marker first so the helper will act, then clean up.
      execFileSync('node', ['-e', 'require("fs").rmSync(process.argv[1],{recursive:true,force:true})', root])
    }
  })

  test('the repository upload strips docs/verification and keeps the two required reads', () => {
    const dest = scratch()
    try {
      materialiseVercelUpload({ root: ROOT, dest, linkNodeModules: false })
      expect(holdsNoFile(join(dest, 'docs/verification'))).toBe(true)
      for (const required of Object.keys(REQUIRED_READS)) {
        expect(existsSync(join(dest, required)), required).toBe(true)
      }
      expect(isGitCheckout(dest)).toBe(false)
    } finally {
      removeUpload(dest)
    }
  })
})

describe('telling the build host from a developer machine', () => {
  test('holdsNoFile is true for an absent directory', () => {
    expect(holdsNoFile(join(tmpdir(), 'no-such-directory-ab12cd34'))).toBe(true)
  })

  test('holdsNoFile is true for a tree of empty directories, which is the stripped shape', () => {
    const root = scratch()
    try {
      mkdirSync(join(root, 'a', 'b', 'c'), { recursive: true })
      expect(holdsNoFile(root)).toBe(true)
    } finally {
      removeUpload(root)
    }
  })

  test('holdsNoFile is false for one file at any depth', () => {
    const root = scratch()
    try {
      writeTree(root, { 'a/b/c/only.txt': 'x' })
      expect(holdsNoFile(root)).toBe(false)
    } finally {
      removeUpload(root)
    }
  })

  test('isGitCheckout separates this repository from a bare temp directory', () => {
    const root = scratch()
    try {
      expect(isGitCheckout(ROOT)).toBe(true)
      expect(isGitCheckout(root)).toBe(false)
    } finally {
      removeUpload(root)
    }
  })

  test('listTrackedFiles returns committed paths and nothing untracked', () => {
    const tracked = listTrackedFiles(ROOT)
    expect(tracked).toContain('.vercelignore')
    expect(tracked).toContain('docs/PRICING.md')
    expect(tracked.some((p) => p.startsWith('node_modules/'))).toBe(false)
  })
})

describe('the registry the two guards share', () => {
  test('every REQUIRED read exists in the tree', () => {
    for (const path of Object.keys(REQUIRED_READS)) {
      expect(existsSync(join(ROOT, path)), path).toBe(true)
    }
  })

  test('every TOLERANT entry names a script that exists', () => {
    for (const path of Object.keys(TOLERANT_FILES)) {
      expect(existsSync(join(ROOT, path)), path).toBe(true)
    }
  })

  test('no path is both required and tolerant, which would be two answers to one question', () => {
    for (const path of Object.keys(TOLERANT_FILES)) {
      expect(Object.hasOwn(REQUIRED_READS, path), path).toBe(false)
    }
  })

  test('every reason is a sentence a reader can act on, not a placeholder', () => {
    for (const [path, reason] of [...Object.entries(REQUIRED_READS), ...Object.entries(TOLERANT_FILES)]) {
      expect(reason.length, path).toBeGreaterThan(40)
    }
  })
})
