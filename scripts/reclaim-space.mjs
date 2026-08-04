/**
 * reclaim-space.mjs - clear regenerable build/tool artefacts so a full disk
 * never blocks work again.
 *
 * Deletes ONLY things that regenerate on the next build/install:
 *   - .next / dist / out / node_modules/.cache in every EventLinqs worktree
 *     EXCEPT the active project (this repo keeps its node_modules)
 *   - npm / pnpm / yarn caches
 *   - stale Claude Code session temp evidence dirs (already committed to git)
 *
 * NEVER touches: source, .env files, .git, node_modules of the active repo,
 * OneDrive/Documents/Downloads/Music/Pictures/Dropbox.
 *
 * Run:  node scripts/reclaim-space.mjs          (this repo's siblings)
 *       node scripts/reclaim-space.mjs --deep   (also clears the sibling
 *                                                 node_modules, biggest win)
 */
import { execSync } from 'node:child_process'
import { statfsSync } from 'node:fs'
import { readdirSync, rmSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const EVENTS_ROOT = resolve(REPO, '..')
const DEEP = process.argv.includes('--deep')

function freeGb() {
  try {
    const s = statfsSync(REPO)
    return (s.bavail * s.bsize) / 1024 ** 3
  } catch {
    return NaN
  }
}

function rm(path) {
  if (!existsSync(path)) return 0
  try {
    rmSync(path, { recursive: true, force: true })
    return 1
  } catch {
    return 0
  }
}

const before = freeGb()
console.log(`[reclaim] free before: ${before.toFixed(2)} GB`)

// Sibling worktrees: clear build caches (always) and node_modules (--deep).
let dirsCleared = 0
try {
  for (const name of readdirSync(EVENTS_ROOT)) {
    const dir = join(EVENTS_ROOT, name)
    if (dir === REPO) continue // never the active repo's node_modules
    if (!existsSync(join(dir, 'package.json'))) continue
    dirsCleared += rm(join(dir, '.next'))
    dirsCleared += rm(join(dir, 'dist'))
    dirsCleared += rm(join(dir, 'out'))
    dirsCleared += rm(join(dir, 'node_modules', '.cache'))
    if (DEEP) dirsCleared += rm(join(dir, 'node_modules'))
  }
} catch {
  // EVENTS_ROOT may not be an EventLinqs multi-worktree layout; that is fine.
}

// The active repo's own regenerable caches (NOT its node_modules).
rm(join(REPO, '.next'))
rm(join(REPO, 'node_modules', '.cache'))
rm(join(REPO, 'playwright-report'))
rm(join(REPO, 'test-results'))

// Package-manager caches.
for (const cmd of ['npm cache clean --force', 'pnpm store prune', 'yarn cache clean']) {
  try {
    execSync(cmd, { stdio: 'ignore' })
  } catch {
    // manager may not be installed; skip.
  }
}

const after = freeGb()
console.log(`[reclaim] cleared ${dirsCleared} artefact folder(s)${DEEP ? ' (deep)' : ''} + package caches`)
console.log(`[reclaim] free after:  ${after.toFixed(2)} GB  (reclaimed ${(after - before).toFixed(2)} GB)`)
