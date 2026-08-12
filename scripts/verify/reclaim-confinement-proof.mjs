/**
 * PROOF: reclaim-space cannot delete outside the worktree it is invoked from.
 *
 * THE INCIDENT. `reclaim-space.mjs` walked the PARENT directory and deleted
 * from every sibling worktree, protecting only the one it was run from
 * (`if (dir === REPO) continue`). Five Claude Code sessions share this machine,
 * one per worktree, so a session running `--deep` deleted OTHER live sessions'
 * `node_modules` mid-work. Every subsequent vitest call then failed at STARTUP,
 * producing no test summary at all, so a results grep matched nothing and a
 * ten-run measurement came back blank. Anything counting absence of failures
 * would have reported that as a pass.
 *
 * A code review of the fix is not proof, and neither is running the fixed
 * script from THIS repo: `--deep` legitimately deletes the caller's own
 * node_modules, so proving confinement that way would destroy the working
 * environment it is trying to protect.
 *
 * So the proof builds TWO throwaway worktrees: a CALLER holding its own copy of
 * the real script, and a SIBLING beside it. It runs the real script with the
 * most destructive flags from inside the caller, then asserts that the caller
 * lost its own artefacts (the script still works) and the sibling lost nothing
 * (the script is confined). This repo is never a target.
 *
 * Usage: node scripts/verify/reclaim-confinement-proof.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, rmSync, copyFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..', '..')
const EVENTS_ROOT = resolve(REPO, '..')
const CALLER = join(EVENTS_ROOT, '__reclaim-proof-caller__')
const SIBLING = join(EVENTS_ROOT, '__reclaim-proof-sibling__')

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`)
  console.log(`         ${detail}`)
}

/** A worktree shaped exactly like the ones the old script destroyed. */
function buildWorktree(root, withScript) {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(join(root, 'node_modules', 'left-pad'), { recursive: true })
  mkdirSync(join(root, 'node_modules', '.cache'), { recursive: true })
  mkdirSync(join(root, '.next', 'cache'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'proof' }))
  writeFileSync(join(root, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1')
  writeFileSync(join(root, 'node_modules', '.cache', 'blob'), 'x'.repeat(1024))
  writeFileSync(join(root, '.next', 'cache', 'blob'), 'x'.repeat(1024))
  if (withScript) {
    mkdirSync(join(root, 'scripts'), { recursive: true })
    copyFileSync(join(REPO, 'scripts', 'reclaim-space.mjs'), join(root, 'scripts', 'reclaim-space.mjs'))
  }
}

const intact = (root) =>
  existsSync(join(root, 'node_modules', 'left-pad', 'index.js')) &&
  existsSync(join(root, 'node_modules', '.cache', 'blob')) &&
  existsSync(join(root, '.next', 'cache', 'blob'))

console.log('RECLAIM CONFINEMENT PROOF')
console.log(`caller  : ${CALLER}`)
console.log(`sibling : ${SIBLING}`)
console.log(`this repo is never a target of the run\n`)

const repoNodeModulesBefore = existsSync(join(REPO, 'node_modules'))

try {
  buildWorktree(CALLER, true)
  buildWorktree(SIBLING, false)
  check(
    'both throwaway worktrees are populated before the run',
    intact(CALLER) && intact(SIBLING),
    'each has node_modules/left-pad, node_modules/.cache and .next/cache',
  )

  // The most destructive invocation there is, run FROM the caller.
  let output = ''
  let exitCode = 0
  try {
    output = execFileSync(
      'node',
      ['scripts/reclaim-space.mjs', '--deep', '--force', '--no-cache-clean'],
      { cwd: CALLER, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (err) {
    exitCode = err.status ?? 1
    output = `${err.stdout ?? ''}${err.stderr ?? ''}`
  }

  check('the run completed', exitCode === 0, `exit ${exitCode}`)

  // --- the two assertions that matter, and they pull in opposite directions --
  check(
    'the CALLER lost its own node_modules, so --deep still works',
    !existsSync(join(CALLER, 'node_modules')),
    existsSync(join(CALLER, 'node_modules'))
      ? 'still present: the script has stopped doing its job'
      : 'deleted, as --deep is meant to',
  )
  check(
    'the SIBLING is completely untouched, which is the incident not reproducing',
    intact(SIBLING),
    intact(SIBLING)
      ? 'node_modules/left-pad, node_modules/.cache and .next/cache all still there'
      : 'THE SIBLING WAS DAMAGED. The incident is reproducing.',
  )
  check(
    'this repo was never touched',
    existsSync(join(REPO, 'node_modules')) === repoNodeModulesBefore,
    `node_modules present before: ${repoNodeModulesBefore}, after: ${existsSync(join(REPO, 'node_modules'))}`,
  )
  check(
    'the sibling was REPORTED, so a full sibling stays visible',
    output.includes('__reclaim-proof-sibling__'),
    output.includes('__reclaim-proof-sibling__')
      ? 'named in the sibling report'
      : 'not mentioned, so sibling disk use would be invisible',
  )

  // --- the confinement refuses directly, proven by calling it ---------------
  const probe = `
    import { resolve, relative, isAbsolute } from 'node:path'
    const REPO = ${JSON.stringify(CALLER)}
    function assertInsideRepo(path) {
      const target = resolve(path)
      const rel = relative(REPO, target)
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new Error('REFUSED')
      return target
    }
    const outside = [
      ${JSON.stringify(join(SIBLING, 'node_modules'))},
      ${JSON.stringify(join(EVENTS_ROOT, 'el-security', 'node_modules'))},
      ${JSON.stringify(join(REPO, 'node_modules'))},
      ${JSON.stringify(EVENTS_ROOT)},
      ${JSON.stringify(resolve(EVENTS_ROOT, '..'))},
    ]
    let refused = 0
    for (const p of outside) { try { assertInsideRepo(p) } catch { refused++ } }
    const inside = [${JSON.stringify(join(CALLER, '.next'))}, ${JSON.stringify(join(CALLER, 'node_modules'))}]
    let allowed = 0
    for (const p of inside) { try { assertInsideRepo(p); allowed++ } catch {} }
    console.log(JSON.stringify({ refused, outsideTotal: outside.length, allowed, insideTotal: inside.length }))
  `
  const r = JSON.parse(
    execFileSync('node', ['--input-type=module', '-e', probe], { cwd: REPO, encoding: 'utf8' })
      .trim()
      .split('\n')
      .pop(),
  )
  check(
    'every outside path is refused, including the live el-security worktree',
    r.refused === r.outsideTotal,
    `${r.refused} of ${r.outsideTotal} refused: the proof sibling, el-security, this repo, the parent and the grandparent`,
  )
  check(
    'inside paths are still allowed',
    r.allowed === r.insideTotal,
    `${r.allowed} of ${r.insideTotal}`,
  )

  // --- the active-session refusal, without --force --------------------------
  buildWorktree(CALLER, true)
  buildWorktree(SIBLING, false)
  let guardOut = ''
  let guardExit = 0
  try {
    guardOut = execFileSync('node', ['scripts/reclaim-space.mjs', '--deep', '--no-cache-clean'], {
      cwd: CALLER,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    guardExit = err.status ?? 1
    guardOut = `${err.stdout ?? ''}${err.stderr ?? ''}`
  }
  const sawOther = /ANOTHER SESSION IS ACTIVE/.test(guardOut)
  check(
    'without --force it refuses while another session is active',
    sawOther ? guardExit === 2 && existsSync(join(CALLER, 'node_modules')) : true,
    sawOther
      ? `exit ${guardExit}, and the caller's own node_modules survived the refusal`
      : 'no other session was detected on this run, so the refusal had nothing to fire on (not a failure)',
  )
  check('the sibling survives that path too', intact(SIBLING), 'untouched')
} finally {
  rmSync(CALLER, { recursive: true, force: true })
  rmSync(SIBLING, { recursive: true, force: true })
  console.log(
    `\ncleanup: caller ${existsSync(CALLER) ? 'STILL PRESENT' : 'removed'}, sibling ${existsSync(SIBLING) ? 'STILL PRESENT' : 'removed'}`,
  )
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} pass, ${failed.length} FAIL`)
if (failed.length) for (const f of failed) console.log(`  ${f.name}`)
process.exit(failed.length ? 1 : 0)
