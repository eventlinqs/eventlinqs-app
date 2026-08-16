/**
 * LOCK 2: the pricing lock rule, in the CRITICAL_ENV_RULES pattern.
 *
 * Modelled on SUPABASE_ENV_ISOLATION in `critical-env.mjs`: a named,
 * buildCritical rule with a `describe`, a `resolve` that gathers the facts and
 * a `validate` that returns { ok } or { ok: false, reason }. It lives in its own
 * module for one honest reason: the env evaluator is SYNCHRONOUS and reads
 * process.env, while this rule performs a NETWORK READ of public.pricing_rules.
 * Rather than make the whole evaluator async, the rule keeps the same shape and
 * gets its own runner (`scripts/check-pricing-lock.mjs`, wired into prebuild).
 *
 * WHAT IT CLOSES. pricing_rules is DATA, not code, so nothing in the normal
 * pipeline notices when a value moves. An admin with `admin.pricing.manage` can
 * change a live rate through /admin/pricing and the platform will charge the new
 * number immediately, silently, with the only trace being an audit-log row that
 * nobody is watching. This rule makes the NEXT BUILD fail unless docs/PRICING.md
 * has been updated to agree, which converts a silent money change into a loud,
 * blocking, reviewable one.
 *
 * docs/PRICING.md IS THE AUTHORITY. The locked figures are parsed out of that
 * document, not duplicated here, so the prose the founder reads and the values
 * the guard enforces are physically the same characters.
 *
 * NEVER LOGGED: the service-role key, the connection URL beyond its project ref,
 * and any environment secret. Fee values ARE logged on mismatch, deliberately:
 * they are published figures, and a guard that will not say which number is
 * wrong is not usable at 2am.
 */

import fs from 'node:fs'
import path from 'node:path'

export const PRICING_DOC = 'docs/PRICING.md'

const LOCK_BEGIN = '<!-- PRICING-LOCK:BEGIN -->'
const LOCK_END = '<!-- PRICING-LOCK:END -->'

/** The rules the lock covers, and how each is stored in pricing_rules. */
export const LOCKED_RULE_TYPES = [
  { key: 'platform_fee_percentage', valueType: 'percentage', column: 'value_percentage' },
  { key: 'platform_fee_fixed', valueType: 'fixed', column: 'value_cents' },
  /*
   * ONE-FEE-ALLOW-BEGIN: names the removed rules so the list is auditable.
   * `processing_fee_percentage` and `processing_fee_fixed_cents` were REMOVED
   * from this list on 15 August 2026, when the founder ruling deleted the
   * separate processing fee. No code reads those rules any more, so the rows in
   * `pricing_rules` are inert history. Asserting a live value for a rule nothing
   * consumes would make the build depend on data that no longer means anything.
   * ONE-FEE-ALLOW-END
   *
   * `processing_fee_pass_through` STAYS, because it is still read: despite its
   * name it governs whether the single fee is passed to the buyer or absorbed by
   * the organiser. Renaming it needs a migration and a coordinated deploy.
   */
  { key: 'processing_fee_pass_through', valueType: 'integer', column: 'value_integer' },
]

/**
 * Parses the locked block out of docs/PRICING.md.
 * Throws if the document is missing or the block is absent, because a build
 * with no authority to check against must not be treated as a passing build.
 */
export function parseLockedValues(repoRoot = process.cwd()) {
  const file = path.join(repoRoot, PRICING_DOC)
  if (!fs.existsSync(file)) {
    throw new Error(`${PRICING_DOC} is missing. It is the authority for every fee figure; the build cannot verify pricing without it.`)
  }
  const text = fs.readFileSync(file, 'utf8')
  const start = text.indexOf(LOCK_BEGIN)
  const end = text.indexOf(LOCK_END)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${PRICING_DOC} has no ${LOCK_BEGIN} ... ${LOCK_END} block. The build guard parses that block; without it there is nothing to enforce.`)
  }
  const body = text.slice(start + LOCK_BEGIN.length, end)
  const out = {}
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/)
    if (!m) continue
    const [, k, raw] = m
    out[k] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw
  }
  for (const r of LOCKED_RULE_TYPES) {
    if (typeof out[r.key] !== 'number') {
      throw new Error(`${PRICING_DOC} lock block is missing a numeric value for ${r.key}`)
    }
  }
  if (!out.country || !out.currency) {
    throw new Error(`${PRICING_DOC} lock block must declare country and currency`)
  }
  return out
}

/** The project ref, for logging. Never logs the key or the full URL. */
function refFromUrl(url) {
  const m = String(url || '').match(/https:\/\/([a-z0-9]+)\.supabase\./i)
  return m ? m[1] : ''
}

/**
 * Reads the CURRENTLY RESOLVED value for each locked rule, replicating
 * selectActiveRule() from src/lib/payments/pricing-rules.ts exactly: region
 * scope (organisation_id IS NULL, event_id IS NULL), inside the effectiveness
 * window, highest version wins.
 *
 * Also counts how many rows are simultaneously OPEN per rule. More than one is
 * the versioning-hygiene defect that makes the resolved value depend on
 * ordering alone, so the guard reports it even when the top value is correct.
 */
export async function readLiveRules(env, locked) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW || env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW || env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) return { reachable: false, ref: refFromUrl(url), rules: {} }

  const now = new Date().toISOString()
  const rules = {}
  for (const r of LOCKED_RULE_TYPES) {
    const q = new URLSearchParams({
      select: `id,version,value_type,${r.column}`,
      rule_type: `eq.${r.key}`,
      country_code: `eq.${locked.country}`,
      currency: `eq.${locked.currency}`,
      event_id: 'is.null',
      organisation_id: 'is.null',
      effective_from: `lte.${now}`,
      or: `(effective_until.is.null,effective_until.gt.${now})`,
      order: 'version.desc',
    })
    let res
    try {
      res = await fetch(`${url}/rest/v1/pricing_rules?${q}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      })
    } catch (e) {
      return { reachable: false, ref: refFromUrl(url), rules: {}, error: e.message }
    }
    if (!res.ok) {
      return { reachable: false, ref: refFromUrl(url), rules: {}, error: `HTTP ${res.status}` }
    }
    const rows = await res.json()
    rules[r.key] = {
      value: rows.length ? Number(rows[0][r.column]) : null,
      version: rows.length ? rows[0].version : null,
      openRows: rows.length,
    }
  }
  return { reachable: true, ref: refFromUrl(url), rules }
}

export const PRICING_LOCK_RULE = {
  name: 'PRICING_LOCKED_VALUES',
  buildCritical: true,
  publicVar: false,
  describe: 'Live pricing_rules must equal the locked figures in docs/PRICING.md',

  /** Gathers the facts. Returns the shape validate() consumes. */
  resolve: async env => {
    const locked = parseLockedValues()
    const live = await readLiveRules(env, locked)
    return { locked, live }
  },

  /**
   * Fails the build when a live value differs from the document, or when a rule
   * resolves to nothing at all. Multiple open rows are reported as a WARNING
   * rather than a failure: the resolver still returns the right number, and
   * failing every build over pre-existing history would block the very
   * migration that fixes it.
   */
  validate: ({ locked, live }) => {
    if (!live.reachable) {
      return {
        ok: false,
        reason:
          `pricing_rules could not be read${live.error ? ` (${live.error})` : ''}, so the locked values are UNVERIFIED. ` +
          `A build that cannot prove its own pricing must not ship.`,
      }
    }
    const problems = []
    const warnings = []
    for (const r of LOCKED_RULE_TYPES) {
      const want = locked[r.key]
      const got = live.rules[r.key]
      if (!got || got.value === null) {
        problems.push(`${r.key}: no effective rule found for ${locked.country}/${locked.currency} (docs/PRICING.md expects ${want})`)
        continue
      }
      if (Number(got.value) !== Number(want)) {
        problems.push(`${r.key}: live value ${got.value} (v${got.version}) does not equal the locked ${want} in ${PRICING_DOC}`)
      }
      if (got.openRows > 1) {
        warnings.push(`${r.key}: ${got.openRows} rows are simultaneously open; the resolved value depends on version ordering alone`)
      }
    }
    if (problems.length === 0) return { ok: true, warnings }
    return {
      ok: false,
      warnings,
      reason:
        `${problems.length} pricing rule(s) disagree with ${PRICING_DOC} on project ${live.ref}:\n` +
        problems.map(p => `      - ${p}`).join('\n') +
        `\n    Either the database drifted (apply the pricing lock migration) or the figures changed with founder approval (update ${PRICING_DOC} and commit it).`,
    }
  },
}
