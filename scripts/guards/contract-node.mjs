/**
 * Run the guard suite under the Node major CI actually uses.
 *
 * This is the layer the static check cannot be: a denylist only knows the APIs
 * someone remembered to list, but the real runtime knows all of them. On
 * 2026-08-05 three guards passed on the author's Node 24 and crashed on CI's
 * Node 20. One command that reproduces CI's runtime on the author's machine is
 * what turns that from a thing you must remember into a thing you can check.
 *
 * The version comes from `.nvmrc`, the same file `actions/setup-node` reads in
 * the workflows, so there is exactly one definition of the number.
 *
 * Invoked by `npm run guards:contract-node`. It is deliberately NOT on the
 * `prebuild` path: in CI the runtime is already correct, so downloading a second
 * copy of Node there would be waste. This is the local-machine tool.
 *
 * An optional script path runs something else under the contract Node instead of
 * the guard suite. `npm run guards:surface` uses that to regenerate the API
 * surface manifest, which MUST be produced by the contract version to mean
 * anything.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const NVMRC = join(ROOT, '.nvmrc')

if (!existsSync(NVMRC)) {
  console.error('[contract-node] .nvmrc is missing. There is no contract to run against.')
  process.exit(1)
}

const major = Number.parseInt(readFileSync(NVMRC, 'utf8').trim().replace(/^v/, ''), 10)
if (!Number.isInteger(major)) {
  console.error('[contract-node] .nvmrc does not contain a Node major version.')
  process.exit(1)
}

const running = Number.parseInt(process.versions.node.split('.')[0], 10)

/** Default target is the guard suite; an argument overrides it. */
const target = process.argv[2] ? join(ROOT, process.argv[2]) : join(HERE, 'run-guards.mjs')

if (running === major) {
  console.log(`[contract-node] already on Node ${process.versions.node}, which is the contract. Running directly.`)
  const direct = spawnSync(process.execPath, [target], { stdio: 'inherit', cwd: ROOT })
  process.exit(direct.status ?? 1)
}

console.log(
  `[contract-node] this machine runs Node ${process.versions.node}; CI runs Node ${major}.\n` +
    `[contract-node] fetching Node ${major} and running the guard suite under it.\n`,
)

// `npx node@<major>` resolves and caches a real Node binary of that major, which
// is the point: the guards must execute on the same runtime CI executes them on,
// not a shimmed or transpiled approximation of it.
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['--yes', `node@${major}`, target],
  { stdio: 'inherit', cwd: ROOT },
)

if (result.error) {
  console.error(`\n[contract-node] could not launch Node ${major}: ${result.error.message}`)
  console.error(`[contract-node] this check is INCONCLUSIVE, which is not the same as a pass.\n`)
  process.exit(1)
}

process.exit(result.status ?? 1)
