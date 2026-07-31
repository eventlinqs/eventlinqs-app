/**
 * The evaluators every lock shares. One implementation, three consumers:
 *
 *   LOCK 2  scripts/check-public-env.mjs   in the BUILD, where the values are real
 *   LOCK 3  scripts/check-env-stores.mjs   across the two configuration STORES
 *   LOCK 4  src/lib/health/checks.ts       in the SERVING deployment, on a schedule
 *
 * Nothing here hardcodes a variable name: every check is driven by the entries
 * and cross rules declared in ./manifest.mjs. Adding a variable to the manifest
 * is the entire change.
 *
 * SECRECY IS STRUCTURAL, NOT A HABIT. No function in this file returns, logs,
 * concatenates or packs a value. What comes out is a finding: the variable name,
 * a state, a plain-language reason, a length and an 8-character SHA-256
 * fingerprint. The fingerprint exists so two stores can be compared, and a
 * future session can confirm a value has not moved, without anyone ever reading
 * it. Eight hex characters of a SHA-256 over a 64-character random secret is not
 * a usable oracle.
 *
 * Plain .mjs so the pre-build node process, the standalone store checker and the
 * TypeScript runtime all import the same code.
 */

import crypto from 'node:crypto'
import { ENV_MANIFEST, CROSS_RULES, policyFor, shapeFor, SENSITIVE_CAPABLE_SCOPES } from './manifest.mjs'
import {
  PRODUCTION_SUPABASE_REF,
  refFromUrl,
  refFromJwt,
  stripeKeyMode,
  stripeAccountRef,
} from './refs.mjs'

export { refFromUrl, refFromJwt, stripeKeyMode, stripeAccountRef }

/** Short, non-reversible identity for a value. Never the value itself. */
export function fingerprint(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 8)
}

/**
 * The scope this process is running as, resolved the way the BUILD and the
 * RUNTIME both see it. `local` when there is no Vercel target at all, which is a
 * developer machine or CI.
 */
export function resolveScope(env) {
  return env.VERCEL_ENV || env.NEXT_PUBLIC_VERCEL_ENV || 'local'
}

/**
 * Check one value against one shape. Returns null when it conforms, or a
 * plain-language reason when it does not. A shape with a `listSeparator` is
 * applied to EVERY entry, which is how the comma-separated webhook signing
 * secrets are held to the whsec_ form one at a time.
 */
export function checkShape(value, shape) {
  const v = (value ?? '').trim()
  const entries = shape.listSeparator
    ? v.split(shape.listSeparator).map(s => s.trim()).filter(s => s.length > 0)
    : [v]

  if (entries.length === 0) return 'no entries listed'
  const re = new RegExp(shape.pattern)
  const tooShort = entries.filter(e => e.length < shape.minLength)
  if (tooShort.length > 0) {
    return shape.listSeparator
      ? `${tooShort.length} of ${entries.length} entries are shorter than the ${shape.minLength}-character minimum`
      : `${v.length} characters, below the ${shape.minLength}-character minimum (expected ${shape.describe})`
  }
  const bad = entries.filter(e => !re.test(e))
  if (bad.length > 0) {
    return shape.listSeparator
      ? `${bad.length} of ${entries.length} entries do not match ${shape.describe}`
      : `does not match ${shape.describe}`
  }
  return null
}

/**
 * LOCK 2 and LOCK 4's core: does the environment THIS PROCESS can see satisfy
 * the manifest for its scope?
 *
 * What it can prove, because the values are real here:
 *   - every variable required on this scope is present, non-empty and correctly
 *     shaped (including the stricter production-only shapes);
 *   - no variable forbidden on this scope is present;
 *   - every optional variable that IS present is correctly shaped, so a
 *     malformed soft value cannot hide.
 *
 * What it cannot prove, stated so no one reads more into a pass than it carries:
 * anything about a scope OTHER than this one, and the Sensitive flag. Neither is
 * visible from inside a deployment. Both are LOCK 3's job, which reads the store.
 *
 * @returns {{scope: string, findings: Finding[], checked: number}}
 */
export function evaluateScopeConformance(env, opts = {}) {
  const manifest = opts.manifest ?? ENV_MANIFEST
  const scope = opts.scope ?? resolveScope(env)
  const findings = []
  let checked = 0

  for (const entry of manifest) {
    const policy = policyFor(entry, scope)
    const raw = env[entry.name]
    const present = typeof raw === 'string' && raw.trim().length > 0
    const declared = entry.name in env

    if (policy === 'forbidden') {
      if (present) {
        findings.push({
          name: entry.name,
          state: 'forbidden-present',
          // ALWAYS BLOCKING. A variable forbidden on a scope is never a
          // fresh-clone nuisance and never correct: it is a fixture flag serving
          // fabricated events to real buyers, a guard bypass left switched on, or
          // a preview override pointing live traffic at the test database.
          severity: 'always-blocking',
          scope,
          reason: `is FORBIDDEN on the ${scope} scope but is present. ${entry.describe}.`,
          length: raw.trim().length,
          fp: fingerprint(raw.trim()),
        })
      }
      checked++
      continue
    }

    if (policy === 'required') {
      if (!present) {
        findings.push({
          name: entry.name,
          // "declared but empty" is called out separately from "absent" because
          // present-but-empty is the failure class that passes every naive
          // presence check and errors nowhere.
          state: declared ? 'empty' : 'missing',
          severity: 'blocking',
          scope,
          reason: declared
            ? `is REQUIRED on the ${scope} scope and is present but EMPTY (the silent-failure class). ${entry.describe}.`
            : `is REQUIRED on the ${scope} scope and is absent. ${entry.describe}.`,
          length: 0,
          fp: null,
        })
        checked++
        continue
      }
    }

    if (present) {
      const shape = shapeFor(entry, scope)
      const problem = checkShape(raw, shape)
      if (problem) {
        findings.push({
          name: entry.name,
          state: 'malformed',
          severity: policy === 'required' ? 'blocking' : 'blocking',
          scope,
          reason: `fails its declared shape on the ${scope} scope: ${problem}.`,
          length: raw.trim().length,
          fp: fingerprint(raw.trim()),
        })
      }
    }
    checked++
  }

  return { scope, findings, checked }
}

/**
 * The value-level CROSS-VARIABLE rules. Each one asks whether two variables
 * AGREE, which is a question no per-variable rule can ask. Runs wherever the
 * values are real: in the build and in the serving deployment.
 */
export function evaluateValueCrossRules(env, opts = {}) {
  const rules = (opts.rules ?? CROSS_RULES).filter(r => r.needs === 'value')
  const scope = opts.scope ?? resolveScope(env)
  const findings = []

  for (const rule of rules) {
    if (!rule.appliesTo.includes(scope)) continue

    if (rule.kind === 'stripeModeAgreement') {
      const wrong = rule.members
        .map(name => ({ name, mode: stripeKeyMode(env[name]) }))
        .filter(m => m.mode !== rule.requiredMode)
      if (wrong.length > 0) {
        findings.push({
          name: rule.id,
          state: 'cross-rule',
          severity: 'always-blocking',
          scope,
          reason:
            `${wrong.map(w => `${w.name} is ${w.mode}`).join('; ')}, expected ${rule.requiredMode} on ${scope}. ` +
            `Production would take card details and settle NOTHING: a test-mode charge moves no money.`,
        })
      }
      continue
    }

    // THE MIRROR IMAGE OF STRIPE_MODE_FAMILY. That rule holds PRODUCTION to live
    // keys. This one holds every other scope AWAY from them. It is the guarantee
    // that makes a readable Development secret tolerable: the platform will not
    // let a live credential be the thing sitting there in plain text.
    if (rule.kind === 'liveCredentialIsolation') {
      const offenders = rule.modeVars
        .map(name => ({ name, mode: stripeKeyMode(env[name]) }))
        .filter(m => m.mode === rule.forbiddenMode)
      if (offenders.length > 0) {
        findings.push({
          name: rule.id,
          state: 'cross-rule',
          severity: 'always-blocking',
          scope,
          reason:
            `${offenders.map(o => `${o.name} is ${o.mode} mode`).join('; ')} on the ${scope} scope, which must ` +
            `never hold a ${rule.forbiddenMode} credential. A live key off production can move real money from a ` +
            `deployment nobody is watching, and on development the platform cannot even store it sensitive, so ` +
            `anyone with project access can read it. Replace it with the test-mode key.`,
        })
      }
      continue
    }

    // TWO ORIGINS THAT DISAGREE. Neither variable is wrong on its own, which is
    // why no page, no build and no log ever reports this.
    if (rule.kind === 'originAgreement') {
      const raw = { canonical: env[rule.canonical], alias: env[rule.alias] }
      // Only meaningful when BOTH are set: either one alone is authoritative,
      // and getAppUrl() already falls back to the canonical when the alias is
      // absent, which is the intended arrangement rather than a defect.
      if (raw.canonical?.trim() && raw.alias?.trim()) {
        const originOf = v => {
          try {
            return new URL(/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`).origin
          } catch {
            return null
          }
        }
        const a = originOf(raw.canonical)
        const b = originOf(raw.alias)
        if (a && b && a !== b) {
          findings.push({
            name: rule.id,
            state: 'cross-rule',
            severity: 'always-blocking',
            scope,
            reason:
              `${rule.canonical} resolves to ${a} but ${rule.alias} resolves to ${b} on the ${scope} scope. ` +
              `These must be the same origin. Canonical tags, og:url, the sitemap and every QR-encoded poster ` +
              `link are built from the first; Stripe return URLs, payout emails and share cards from the second. ` +
              `Split them and half of every generated link becomes a redirect, and Stripe does not follow a ` +
              `redirect on a return URL. Set ${rule.alias} to ${a}, or unset it and let it derive.`,
          })
        }
      }
      continue
    }

    if (rule.kind === 'stripeAccountPair') {
      const pkRef = stripeAccountRef(env[rule.publishable])
      const skRef = stripeAccountRef(env[rule.secret])
      // Only meaningful once both keys are the right mode; the mode rule above
      // reports that failure on its own, so do not double-report it here.
      if (stripeKeyMode(env[rule.publishable]) === 'missing' || stripeKeyMode(env[rule.secret]) === 'missing') continue
      if (!pkRef || !skRef) {
        const which = !pkRef && !skRef ? 'neither key' : !pkRef ? rule.publishable : rule.secret
        findings.push({
          name: rule.id,
          state: 'cross-rule',
          severity: 'always-blocking',
          scope,
          reason:
            `the Stripe account id could not be read out of ${which}, so the two keys cannot be proven ` +
            `to belong to the same account. Expected the shape <prefix>_<mode>_51<15-character account id>.`,
        })
        continue
      }
      if (pkRef !== skRef) {
        findings.push({
          name: rule.id,
          state: 'cross-rule',
          severity: 'always-blocking',
          scope,
          reason:
            `${rule.publishable} and ${rule.secret} belong to DIFFERENT Stripe accounts. ` +
            `Stripe.js cannot resolve a clientSecret minted by another account, so the payment element renders ` +
            `nothing and reports no error: checkout would look fine and take no money. ` +
            `Re-copy BOTH keys from the same account in the Stripe dashboard.`,
        })
      }
      continue
    }

    if (rule.kind === 'productionRefIsolation') {
      // A deliberate, named escape hatch so a read-only local investigation
      // against production is still possible and can never be accidental.
      if (env.ALLOW_PRODUCTION_SUPABASE === '1') continue
      const resolvedUrl = rule.urlVars.map(n => env[n]).find(v => v && v.trim()) ?? ''
      const resolvedKey = rule.keyVars.map(n => env[n]).find(v => v && v.trim()) ?? ''
      const offenders = []
      if (refFromUrl(resolvedUrl) === PRODUCTION_SUPABASE_REF) offenders.push(`the resolved ${rule.urlVars.join(' or ')}`)
      if (refFromJwt(resolvedKey) === PRODUCTION_SUPABASE_REF) offenders.push(`the resolved ${rule.keyVars.join(' or ')}`)
      if (refFromJwt(env[rule.rawKeyVar] ?? '') === PRODUCTION_SUPABASE_REF) {
        offenders.push(`the raw ${rule.rawKeyVar} (reachable by a direct process.env read)`)
      }
      if (offenders.length > 0) {
        findings.push({
          name: rule.id,
          state: 'cross-rule',
          severity: 'always-blocking',
          scope,
          reason:
            `${scope === 'local' ? 'This LOCAL run' : `scope ${scope}`}: ${offenders.join(' and ')} ` +
            `point at the PRODUCTION Supabase project ${PRODUCTION_SUPABASE_REF}. ` +
            `A non-production deployment must never be able to read or write the live database. ` +
            `Deliberate override: ALLOW_PRODUCTION_SUPABASE=1.`,
        })
      }
      continue
    }

    if (rule.kind === 'requiredListOnScope') {
      if (rule.scope !== scope) continue
      const raw = (env[rule.variable] ?? '').trim()
      if (raw.length === 0) {
        findings.push({
          name: rule.id,
          state: 'cross-rule',
          severity: 'always-blocking',
          scope,
          reason: `${rule.variable} is absent or empty on the ${rule.scope} scope. ${rule.describe}`,
        })
        continue
      }
      const entries = raw.split(',').map(s => s.trim()).filter(Boolean)
      if (rule.minimumEntries && entries.length < rule.minimumEntries) {
        findings.push({
          name: rule.id,
          state: 'cross-rule',
          severity: 'blocking',
          scope,
          reason:
            `${rule.variable} lists ${entries.length} signing secret(s) on ${rule.scope}, ` +
            `fewer than the ${rule.minimumEntries} Stripe delivery channels this platform runs. ` +
            `Every delivery from the uncovered endpoint fails signature verification and 400s forever ` +
            `while payments keep succeeding.`,
        })
      }
      continue
    }
  }

  return { scope, findings }
}

/**
 * Everything LOCK 2 and LOCK 4 can assert from inside a running process, in one
 * call: per-variable scope conformance plus the value-level cross rules.
 */
export function evaluateProcessEnv(env, opts = {}) {
  const scope = opts.scope ?? resolveScope(env)
  const perVariable = evaluateScopeConformance(env, { ...opts, scope })
  const cross = evaluateValueCrossRules(env, { ...opts, scope })
  const findings = [...perVariable.findings, ...cross.findings]
  return {
    scope,
    checked: perVariable.checked,
    findings,
    alwaysBlocking: findings.filter(f => f.severity === 'always-blocking'),
    blocking: findings.filter(f => f.severity === 'blocking'),
    ok: findings.length === 0,
  }
}

/**
 * LOCK 3's core: does the manifest hold across the CONFIGURATION STORES?
 *
 * This is the half no deployment can see. It takes an INVENTORY of what the
 * stores actually contain and reports scope membership, branch scoping and
 * read-back exposure.
 *
 * THE READ-BACK CHAIN, and why it has no gap. Vercel will not reveal a value it
 * holds as sensitive, so `vercel env pull` returns an EMPTY string for those.
 * That single fact has burned this project twice, because "empty on pull" reads
 * like "not set" and is not the same claim. So the three sources are combined
 * deliberately:
 *
 *   presence and scope   from the store LISTING, which is authoritative and
 *                        never redacted;
 *   read-back exposure   from a scoped PULL: a value that comes back is proof
 *                        the record is NOT sensitive;
 *   the value itself     from the BUILD and the RUNTIME, where it is real, which
 *                        is where the shape and cross-variable rules run.
 *
 * A record that is listed but unreadable is therefore either sensitive (correct)
 * or empty (a defect) - and LOCK 2 and LOCK 4 resolve which, because a build and
 * a serving deployment can both see whether the value is there. No single source
 * is trusted for a claim it cannot support.
 *
 * @param {object} inventory
 * @param {Array<{name: string, scope: string, gitBranch: string|null, readable: boolean|null, length?: number, fp?: string|null}>} inventory.records
 *   `readable` is `null` when this run could not determine read-back exposure
 *   (a branch-pinned record, or a caller that deliberately never requested
 *   values). Unknown never fails a check: only a proven `true` does.
 * @param {string[]} inventory.githubSecrets  names present in GitHub Actions
 * @param {string[]} [inventory.scopesListed]  which scopes the listing covered
 */
export function evaluateStores(inventory, opts = {}) {
  const manifest = opts.manifest ?? ENV_MANIFEST
  const records = inventory.records ?? []
  const ghSecrets = new Set(inventory.githubSecrets ?? [])
  const findings = []

  const recordsFor = (name, scope) => records.filter(r => r.name === name && r.scope === scope)

  for (const entry of manifest) {
    for (const scope of ['production', 'preview', 'development']) {
      const policy = policyFor(entry, scope)
      const rows = recordsFor(entry.name, scope)

      // A record with no gitBranch applies to the WHOLE scope. One pinned to a
      // branch applies only to that branch's deployments.
      const scopeWide = rows.filter(r => !r.gitBranch)
      const branchPinned = rows.filter(r => r.gitBranch)

      if (policy === 'forbidden') {
        if (rows.length > 0) {
          findings.push({
            name: entry.name,
            state: 'forbidden-scope',
            severity: 'always-blocking',
            scope,
            reason:
              `is FORBIDDEN on the ${scope} scope but ${rows.length} record(s) exist there` +
              `${branchPinned.length ? ` (branches: ${branchPinned.map(r => r.gitBranch).join(', ')})` : ''}. ${entry.describe}.`,
          })
        }
        continue
      }

      if (policy === 'required') {
        if (scopeWide.length === 0 && branchPinned.length === 0) {
          findings.push({
            name: entry.name,
            state: 'missing-scope',
            severity: 'blocking',
            scope,
            reason: `is REQUIRED on the ${scope} scope and no record exists there. ${entry.describe}.`,
          })
          continue
        }
        // WRONGLY BRANCH SCOPED. A variable every deployment on a scope needs,
        // pinned to one git branch, leaves every other branch's deployment
        // without it. The deployment still builds and still serves; the feature
        // that needed the variable is just silently dead.
        if (
          scope === 'preview' &&
          entry.previewBranchScoping === 'forbidden' &&
          scopeWide.length === 0 &&
          branchPinned.length > 0
        ) {
          findings.push({
            name: entry.name,
            state: 'wrong-branch-scope',
            severity: 'blocking',
            scope,
            reason:
              `exists on the preview scope ONLY pinned to git branch(es) ` +
              `${branchPinned.map(r => r.gitBranch).join(', ')}. Every preview deployment needs it, so every ` +
              `OTHER branch deploys without it. Add a scope-wide preview record.`,
          })
        }
      }

      // SENSITIVITY. Enforced by the property that matters: can the value be
      // read back out of the store by anyone with project access. A readable
      // record is a definitive failure; an unreadable one is either sensitive or
      // empty, and the build and runtime guards resolve which.
      //
      // ONLY ON THE SCOPES THAT CAN HOLD A SECRET. Vercel rejects a sensitive
      // value on Development outright (reason `sensitive_not_allowed_on_development`),
      // so demanding it there produced a permanent failure whose printed advice,
      // "re-add it with --sensitive", the platform refuses to carry out. That is
      // worse than no check: it trains a reader to skip the whole section. What
      // protects a Development secret instead is LIVE_CREDENTIAL_ISOLATION,
      // which guarantees the readable value is a test credential.
      if (entry.mustBeSensitive && SENSITIVE_CAPABLE_SCOPES.includes(scope) && rows.some(r => r.readable)) {
        const exposed = rows.filter(r => r.readable)
        findings.push({
          name: entry.name,
          state: 'readable-secret',
          severity: 'blocking',
          scope,
          reason:
            `must be stored as SENSITIVE but ${exposed.length} record(s) on the ${scope} scope can be read ` +
            `back in plain text by anyone with project access. ${entry.describe}. ` +
            `Fix: remove the record and re-add it with --sensitive, because --force does NOT change ` +
            `an existing record's sensitivity.`,
        })
      }
    }

    // GITHUB ACTIONS MEMBERSHIP. A variable the workflows need is not optional
    // just because Vercel has it.
    if (entry.githubActions && !ghSecrets.has(entry.name)) {
      findings.push({
        name: entry.name,
        state: 'missing-github-secret',
        severity: 'always-blocking',
        scope: 'github-actions',
        reason:
          `must also exist as a GitHub Actions repository secret and does not. ${entry.describe}. ` +
          `Fix: gh secret set ${entry.name}`,
      })
    }
  }

  return {
    findings,
    alwaysBlocking: findings.filter(f => f.severity === 'always-blocking'),
    blocking: findings.filter(f => f.severity === 'blocking'),
    ok: findings.length === 0,
  }
}

/**
 * Render one finding as a single log line. Carries the name, the state and the
 * reason. Never a value: `fp` is eight hex characters of a SHA-256 and `length`
 * is an integer.
 */
export function formatFinding(f) {
  const tag = f.severity === 'always-blocking' ? 'BLOCK' : 'FAIL '
  const id = f.scope ? `${f.name} [${f.scope}]` : f.name
  const detail = f.fp ? ` (length ${f.length}, fp ${f.fp})` : ''
  return `${tag} ${id}: ${f.reason}${detail}`
}
