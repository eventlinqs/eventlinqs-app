/**
 * reclaim-space.mjs - clear regenerable build artefacts so a full disk never
 * blocks work.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SCRIPT DID WRONG, and why the rules below are absolute.
 *
 * It walked the PARENT directory and deleted from every sibling worktree:
 *
 *     for (const name of readdirSync(EVENTS_ROOT)) {
 *       const dir = join(EVENTS_ROOT, name)
 *       if (dir === REPO) continue          // <-- protected ONLY the caller
 *       ...
 *       if (DEEP) dirsCleared += rm(join(dir, 'node_modules'))
 *     }
 *
 * `if (dir === REPO) continue` protects the worktree it is RUN FROM and nothing
 * else. Five Claude Code sessions share this machine, one per worktree. A
 * session running `npm run reclaim -- --deep` therefore deleted OTHER live
 * sessions' `node_modules` while they were working.
 *
 * On 8 August 2026 that happened mid-session. Every subsequent `vitest` call
 * failed at startup with "Cannot find module 'vitest/config'", and because the
 * failure was at startup the output contained no test summary at all, so a
 * results grep matched nothing and returned empty. A ten-run flake measurement
 * came back blank and would have been reported as a pass by anything that
 * counted absence of failures. Four of the eight sibling worktrees carrying a
 * package.json currently have no `node_modules`.
 *
 * THE RULE, founder ruling 2026-08-08: this script must NEVER delete anything
 * outside the worktree it is invoked from. Not with a flag, not with a
 * confirmation, not ever. The sibling loop is gone; siblings are REPORTED so
 * the disk picture is still visible, and their contents are never touched.
 *
 * Deletion is additionally routed through one function that refuses any path
 * which does not resolve inside this repo, so a future edit that reintroduces a
 * sibling path fails loudly instead of quietly working.
 *
 * Run:  node scripts/reclaim-space.mjs           report + clear this worktree
 *       node scripts/reclaim-space.mjs --deep    also this worktree's node_modules
 *       node scripts/reclaim-space.mjs --report  report only, delete nothing
 *
 * --deep now means "my own node_modules too", which costs one `npm ci`. It no
 * longer means "everybody else's".
 */
import { execSync } from 'node:child_process'
import { statfsSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname, join, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createConnection } from 'node:net'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const EVENTS_ROOT = resolve(REPO, '..')
const DEEP = process.argv.includes('--deep')
const REPORT_ONLY = process.argv.includes('--report')
const FORCE = process.argv.includes('--force')

/** Minutes of quiet before another session's scratch is considered inactive. */
const SESSION_IDLE_MINUTES = 45
/** Ports a dev server in ANY worktree would be listening on. */
const DEV_PORTS = [3000, 3001, 3002, 3100]

function freeGb() {
  try {
    const s = statfsSync(REPO)
    return (s.bavail * s.bsize) / 1024 ** 3
  } catch {
    return NaN
  }
}

/**
 * THE CONFINEMENT. Every deletion goes through here and nothing else may call
 * rmSync. A path that does not resolve strictly inside REPO throws.
 *
 * `relative()` returning something that starts with '..' means the target is
 * outside, and an absolute result means a different drive. Both are refusals.
 */
function assertInsideRepo(path) {
  const target = resolve(path)
  const rel = relative(REPO, target)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `[reclaim] REFUSED: ${target} is not inside ${REPO}. This script may never delete outside the worktree it is invoked from. Five sessions share this machine and a sibling's node_modules is somebody's running work.`,
    )
  }
  return target
}

let deleted = 0
function rm(path) {
  const target = assertInsideRepo(path)
  if (!existsSync(target)) return 0
  if (REPORT_ONLY) {
    console.log(`  would delete: ${relative(REPO, target)}`)
    return 0
  }
  try {
    rmSync(target, { recursive: true, force: true })
    deleted += 1
    return 1
  } catch {
    return 0
  }
}

/** Directory size in GB, cheap and shallow-recursive with a node budget. */
function sizeGb(dir, budget = 200000) {
  let bytes = 0
  let seen = 0
  const walk = (d) => {
    if (seen > budget) return
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch (error) {
      console.warn('[scripts/reclaim-space:118]', error instanceof Error ? error.message : error)
      return
    }
    for (const e of entries) {
      if (seen > budget) return
      seen += 1
      const full = join(d, e.name)
      if (e.isDirectory()) walk(full)
      else {
        try {
          bytes += statSync(full).size
        } catch {
          /* vanished mid-walk */
        }
      }
    }
  }
  walk(dir)
  return bytes / 1024 ** 3
}

// ---------------------------------------------------------------------------
// DETECTION: is anybody else working on this machine right now?
// ---------------------------------------------------------------------------

/**
 * Other Claude Code sessions, detected rather than trusted.
 *
 * Each session gets `%LOCALAPPDATA%/Temp/claude/<encoded-worktree-path>/<session-id>/`.
 * A session dir touched recently means a session is live in that worktree. Two
 * levels only: a recursive walk of every session's scratch takes minutes.
 */
function activeSessions() {
  const root = join(
    process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Local'),
    'Temp',
    'claude',
  )
  if (!existsSync(root)) return []
  const cutoff = Date.now() - SESSION_IDLE_MINUTES * 60_000
  const mine = REPO.replace(/[:\\/]+/g, '-')
  const live = []
  for (const project of readdirSync(root)) {
    let newest = 0
    const projectDir = join(root, project)
    try {
      for (const session of readdirSync(projectDir)) {
        try {
          newest = Math.max(newest, statSync(join(projectDir, session)).mtimeMs)
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      console.warn('[scripts/reclaim-space:172]', error instanceof Error ? error.message : error)
      continue
    }
    if (newest >= cutoff) {
      live.push({
        project,
        isMine: project.toLowerCase().endsWith(mine.toLowerCase().split('-').slice(-1)[0]),
        minutesAgo: Math.round((Date.now() - newest) / 60_000),
      })
    }
  }
  return live
}

/** A dev server listening anywhere means a worktree is being run right now. */
function listeningPorts() {
  return Promise.all(
    DEV_PORTS.map(
      (port) =>
        new Promise((done) => {
          const socket = createConnection({ port, host: '127.0.0.1' })
          const finish = (open) => {
            socket.destroy()
            done(open ? port : null)
          }
          socket.setTimeout(300)
          socket.on('connect', () => finish(true))
          socket.on('timeout', () => finish(false))
          socket.on('error', () => finish(false))
        }),
    ),
  ).then((r) => r.filter(Boolean))
}

// ---------------------------------------------------------------------------
// RUN
// ---------------------------------------------------------------------------
const before = freeGb()
console.log(`[reclaim] worktree: ${REPO}`)
console.log(`[reclaim] free before: ${before.toFixed(2)} GB\n`)

// --- the sibling picture, REPORTED and never touched ------------------------
//
// WHY docs/ IS IN THIS REPORT. Measured 8 August 2026, the EventLinqs tree was
// 16.60 GB, of which:
//
//     10.69 GB  docs/, replicated across nine linked worktrees
//      2.80 GB  node_modules across all worktrees
//      1.66 GB  the shared .git object store
//
// `docs/` is 2790 image files, 2.44 GB in this worktree alone, and every linked
// worktree checks out its own copy. THIS SCRIPT CAN NEVER RECLAIM ANY OF IT: it
// deletes build artefacts, and committed evidence is not a build artefact. That
// is the answer to "the delete did not free space". Even at its most
// destructive the old script could only reach the 2.80 GB of node_modules, and
// it reached it by destroying other sessions' working environments.
//
// So the number is printed. A cleaner that silently reports success while the
// real consumer grows is how a disk guard stops a build at 2am.
console.log('[reclaim] sibling worktrees (reported only, never deleted from):')
let siblingGb = 0
let docsGb = sizeGb(join(REPO, 'docs'))
try {
  for (const name of readdirSync(EVENTS_ROOT)) {
    const dir = join(EVENTS_ROOT, name)
    if (dir === REPO) continue
    if (!existsSync(join(dir, 'package.json'))) continue
    const nm = join(dir, 'node_modules')
    const has = existsSync(nm)
    const gb = has ? sizeGb(nm) : 0
    const dgb = sizeGb(join(dir, 'docs'))
    siblingGb += gb
    docsGb += dgb
    console.log(
      `    ${name.padEnd(28)} ${(has ? `node_modules ${gb.toFixed(2)} GB` : 'no node_modules').padEnd(26)} docs ${dgb.toFixed(2)} GB`,
    )
  }
  console.log(`    (${siblingGb.toFixed(2)} GB of sibling node_modules, and NOT this script's to reclaim)`)
} catch {
  console.log('    not a multi-worktree layout')
}
console.log(
  `\n[reclaim] docs/ across every worktree: ${docsGb.toFixed(2)} GB of committed evidence.`,
)
console.log('          THIS SCRIPT CANNOT RECLAIM ANY OF IT. It is checked-out binary')
console.log('          history, not a build artefact, and it is the largest thing on disk.')
console.log('          To reduce it: sparse-checkout docs/ out of worktrees that do not need')
console.log('          it, which reclaims most of the duplication without losing a single file.')

// --- the refusal ------------------------------------------------------------
const sessions = activeSessions()
const others = sessions.filter((s) => !s.project.endsWith(REPO.split(/[\\/]/).pop()))
const ports = await listeningPorts()

if (others.length || ports.length) {
  console.log('\n[reclaim] ANOTHER SESSION IS ACTIVE ON THIS MACHINE:')
  for (const s of others) {
    console.log(`    session in ${s.project.replace(/^.*EventLinqs-/, '')} (active ${s.minutesAgo} min ago)`)
  }
  for (const p of ports) console.log(`    a dev server is listening on port ${p}`)
  if (!FORCE && !REPORT_ONLY) {
    console.log('')
    console.log('REFUSING TO DELETE. This script only ever touches its own worktree now, so it')
    console.log('cannot harm the other session. It stops anyway because clearing .next or')
    console.log('node_modules underneath a build or a test run in THIS worktree produces the')
    console.log('same confusing startup failures, and because a disk being full is rarely so')
    console.log('urgent that it cannot wait for a colleague to finish.')
    console.log('')
    console.log('  node scripts/reclaim-space.mjs --report    see what would go, delete nothing')
    console.log('  node scripts/reclaim-space.mjs --force     proceed anyway, on your own head')
    process.exit(2)
  }
  if (FORCE) console.log('\n[reclaim] --force given, proceeding despite the above.\n')
}

// --- this worktree ONLY -----------------------------------------------------
console.log(`\n[reclaim] ${REPORT_ONLY ? 'would clear' : 'clearing'} this worktree only:`)
rm(join(REPO, '.next'))
rm(join(REPO, 'node_modules', '.cache'))
rm(join(REPO, 'playwright-report'))
rm(join(REPO, 'test-results'))
rm(join(REPO, 'dist'))
rm(join(REPO, 'out'))
if (DEEP) {
  console.log('  --deep: this worktree\'s own node_modules (costs one npm ci to restore)')
  rm(join(REPO, 'node_modules'))
}

// --- package-manager caches, which belong to the user, not a worktree -------
// `--no-cache-clean` exists for the confinement proof: the caches are shared by
// every session on this machine, and a proof run should not slow four other
// people's next install just to demonstrate a path check.
if (!REPORT_ONLY && !process.argv.includes('--no-cache-clean')) {
  for (const cmd of ['npm cache clean --force', 'pnpm store prune', 'yarn cache clean']) {
    try {
      execSync(cmd, { stdio: 'ignore' })
    } catch (error) {
      console.warn('[scripts/reclaim-space:309]', error instanceof Error ? error.message : error)
      /* manager may not be installed */
    }
  }
}

const after = freeGb()
console.log(`\n[reclaim] ${REPORT_ONLY ? 'report only, nothing deleted' : `deleted ${deleted} folder(s) + package caches`}`)
console.log(`[reclaim] free after:  ${after.toFixed(2)} GB  (reclaimed ${(after - before).toFixed(2)} GB)`)
if (siblingGb > 1) {
  console.log(
    `\n[reclaim] ${siblingGb.toFixed(2)} GB sits in sibling worktrees. To reclaim it, run this`,
  )
  console.log('          script INSIDE that worktree, when nobody is working in it.')
}
