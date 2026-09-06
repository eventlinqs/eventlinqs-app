/**
 * THE VERCEL CLI'S OWN LOGIN, handed to one process and never printed.
 *
 * WHY THIS EXISTS. Two things in this repository read the Vercel API on a
 * developer machine: the environment half of scripts/ops/production-parity.mjs
 * (the production store against the manifest) and
 * scripts/guards/preview-deployment-state.mjs (the state of the deployment of
 * the commit under test). CI hands both VERCEL_TOKEN from the repository
 * secret. On a developer machine nothing sets it, and until 7 September 2026
 * the ledger called minting one a founder step. It was not: `vercel login`
 * already keeps an access token, its expiry and a refresh token in auth.json
 * under the CLI's data directory, and the CLI refreshes it on any command. This
 * module finds that login the way the CLI does, judges it, refreshes it through
 * the CLI when it has expired, and returns the token to the caller. The same
 * discipline as scripts/ops/with-supabase-token.ps1: the credential a tool
 * already keeps is handed to one process, and nobody pastes it anywhere.
 *
 * WHERE THE CLI KEEPS IT. The CLI resolves its data directory by the XDG rules:
 * XDG_DATA_HOME first, then on Windows %APPDATA%\xdg.data (observed on
 * 7 September 2026: CLI 55.0.0 wrote there, and its earlier
 * %APPDATA%\com.vercel.cli\Data\auth.json was a stale copy from July that the
 * API refused with 403), then the POSIX ~/.local/share. The legacy Data path is
 * last, so a fresh login is never shadowed by a stale one. The order is a list,
 * and a list can be short by one: a path this misses reads as "not logged in",
 * never as a wrong token.
 *
 * NEVER PRINTS A TOKEN. A path and a state at most.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[vercel-login]'

/**
 * Every place the CLI may have written auth.json, most current first.
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [home]
 */
export function vercelCliAuthCandidates(env = process.env, home = homedir()) {
  const out = []
  if (env.XDG_DATA_HOME) out.push(join(env.XDG_DATA_HOME, 'com.vercel.cli', 'auth.json'))
  if (env.APPDATA) out.push(join(env.APPDATA, 'xdg.data', 'com.vercel.cli', 'auth.json'))
  if (env.LOCALAPPDATA) out.push(join(env.LOCALAPPDATA, 'xdg.data', 'com.vercel.cli', 'auth.json'))
  out.push(join(home, '.local', 'share', 'com.vercel.cli', 'auth.json'))
  if (env.APPDATA) out.push(join(env.APPDATA, 'com.vercel.cli', 'Data', 'auth.json'))
  return out
}

/**
 * Judge one stored login. `expiresAt` is seconds since the epoch, as the CLI
 * writes it; a token inside a minute of expiry is treated as expired so a
 * request never races the clock. Pure, and the token is only ever returned,
 * never printed.
 */
export function judgeStoredLogin(record, nowSeconds = Date.now() / 1000) {
  if (!record || typeof record.token !== 'string' || record.token.trim() === '') return { state: 'absent' }
  if (typeof record.expiresAt === 'number' && record.expiresAt <= nowSeconds + 60) return { state: 'expired', expiresAt: record.expiresAt }
  return { state: 'usable', token: record.token }
}

function readStoredLogin(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.warn(`${TAG} the Vercel CLI login at ${path} could not be read (${error.message}); treated as not logged in`)
    return null
  }
}

/** The Vercel CLI as a Node program (its .cmd shim needs a shell; its entrypoint does not). */
function vercelCliEntry() {
  const roots = []
  if (process.env.APPDATA) roots.push(join(process.env.APPDATA, 'npm', 'node_modules', 'vercel'))
  roots.push(join(ROOT, 'node_modules', 'vercel'))
  for (const root of roots) {
    const entry = join(root, 'dist', 'index.js')
    if (existsSync(entry)) return { file: process.execPath, prefix: [entry] }
  }
  return null
}

/**
 * Ask the CLI to refresh its own login: `vercel whoami` refreshes an expired
 * access token with the stored refresh token and rewrites auth.json. Its output
 * is not printed (it names the account, nothing more, but nothing is needed).
 */
function refreshVercelCliLogin() {
  const cli = vercelCliEntry()
  if (!cli) return false
  const r = spawnSync(cli.file, [...cli.prefix, 'whoami'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
  return !r.error && r.status === 0
}

/**
 * The token a caller reads the Vercel API with, in this order and never
 * printed: VERCEL_TOKEN from the environment (the repository secret in CI, or
 * .env.local); otherwise the login the Vercel CLI already holds on this
 * machine, refreshed through the CLI when it has expired.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ token: string, source: string } | { token: null, reason: string }}
 */
export function resolveVercelToken(env = process.env) {
  if (typeof env.VERCEL_TOKEN === 'string' && env.VERCEL_TOKEN.trim() !== '') return { token: env.VERCEL_TOKEN, source: 'VERCEL_TOKEN from the environment' }
  const present = vercelCliAuthCandidates(env).filter((p) => existsSync(p))
  if (present.length === 0) return { token: null, reason: 'no VERCEL_TOKEN in the environment and no Vercel CLI login on this machine' }
  let expiredAt = null
  for (const path of present) {
    const judged = judgeStoredLogin(readStoredLogin(path))
    if (judged.state === 'usable') return { token: judged.token, source: `the Vercel CLI login at ${path}` }
    if (judged.state === 'expired') expiredAt = expiredAt ?? path
  }
  if (expiredAt && refreshVercelCliLogin()) {
    for (const path of present) {
      const judged = judgeStoredLogin(readStoredLogin(path))
      if (judged.state === 'usable') return { token: judged.token, source: `the Vercel CLI login at ${path}, refreshed by the CLI` }
    }
  }
  return { token: null, reason: expiredAt ? `the Vercel CLI login at ${expiredAt} has expired and the CLI could not refresh it` : 'the Vercel CLI login on this machine holds no token' }
}
