import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { vercelCliEntry, vercelEntryIn } from '../../../scripts/lib/vercel-cli-entry.mjs'

/*
 * THE VERCEL CLI IS FOUND BY ITS OWN PACKAGE (14 November 2026). CLI 65 moved its entry from dist/index.js to dist/vc.js;
 * the scripts that run it as a Node program assumed the old path, found nothing, spawned `vercel` with no shell, and
 * proof 1 of Lawal's database step failed with 'exit null' and no reason. Both layouts are held here.
 */
const made: string[] = []
function pkg(bin: unknown, file: string | null): string {
  const root = mkdtempSync(join(tmpdir(), 'vercel-cli-'))
  made.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify(bin === undefined ? { name: 'vercel' } : { name: 'vercel', bin }))
  if (file) {
    mkdirSync(join(root, 'dist'), { recursive: true })
    writeFileSync(join(root, file), '')
  }
  return root
}
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('the Vercel CLI entry', () => {
  it('reads the entry from the package bin (CLI 65: dist/vc.js)', () => {
    const root = pkg({ vc: './dist/vc.js', vercel: './dist/vc.js' }, 'dist/vc.js')
    expect(vercelEntryIn(root)).toBe(join(root, 'dist', 'vc.js'))
  })

  it('keeps the old layout for an older install (dist/index.js)', () => {
    const root = pkg(undefined, 'dist/index.js')
    expect(vercelEntryIn(root)).toBe(join(root, 'dist', 'index.js'))
  })

  it('finds nothing where nothing is installed, so the caller says so', () => {
    const root = mkdtempSync(join(tmpdir(), 'vercel-none-'))
    made.push(root)
    expect(vercelEntryIn(root)).toBeNull()
    expect(vercelCliEntry(root, {})).toBeNull()
  })

  it('finds the global install through APPDATA and runs it with this Node, never through a shell', () => {
    const appData = mkdtempSync(join(tmpdir(), 'vercel-appdata-'))
    made.push(appData)
    const global = join(appData, 'npm', 'node_modules', 'vercel')
    mkdirSync(join(global, 'dist'), { recursive: true })
    writeFileSync(join(global, 'package.json'), JSON.stringify({ name: 'vercel', bin: { vercel: './dist/vc.js' } }))
    writeFileSync(join(global, 'dist', 'vc.js'), '')
    const cli = vercelCliEntry(join(appData, 'no-project'), { APPDATA: appData })
    expect(cli).toEqual({ file: process.execPath, prefix: [join(global, 'dist', 'vc.js')] })
  })

  it('both scripts that run the CLI parse', () => {
    for (const f of ['scripts/lib/vercel-cli-entry.mjs', 'scripts/lib/vercel-login.mjs', 'scripts/ops/verify-production-schema.mjs']) {
      expect(spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' }).status, f).toBe(0)
    }
  })
})
