#!/usr/bin/env node
/**
 * Critical-path guard.
 *
 * Three classes of defect are cheap to reintroduce and expensive to notice,
 * because all three LOOK correct in review. This guard fails the build on each.
 *
 * RULE 1 - next/dynamic called from a Server Component.
 *   The Next.js docs state: "When a Server Component dynamically imports a
 *   Client Component, automatic code splitting is currently not supported."
 *   So a next/dynamic call in a file without a 'use client' directive splits
 *   NOTHING. It reads as deferred and is not. This exact trap shipped in this
 *   repo: VenueMap sat behind next/dynamic inside the event detail Server
 *   Component and its Google Maps loader still arrived in the initial chunk
 *   set on every event detail page. A dynamic import that does not split is
 *   worse than no dynamic import, because it stops anyone looking again.
 *
 * RULE 2 - heavy subsystems statically imported by a hot route.
 *   The event detail route statically imported the Canvas seating engine, so
 *   every general admission page downloaded a seat map it can never show
 *   (measured: 61KB transferred across three chunks). The route may only reach
 *   these subsystems through a client boundary that owns the dynamic import.
 *
 * RULE 3 - Sentry Session Replay back in the init integrations array.
 *   rrweb is ~304KB unminified. Listing replayIntegration() in Sentry.init
 *   puts it in the main client chunk on EVERY route, where it was measured
 *   holding LCP "Render Delay" at 3,071ms. It must be armed after load
 *   instead (see sentry.client.config.ts).
 *
 * Run: node scripts/ci/critical-path-guard.mjs
 * Exit 0 clean, exit 1 with an explanation naming the file and the rule.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const failures = []

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full)
  }
  return out
}

const rel = f => path.relative(ROOT, f).replace(/\\/g, '/')

/** A file is a Client Component only if it opens with the 'use client' directive. */
function isClientComponent(src) {
  // The directive must precede any statement; comments and blank lines are fine.
  const head = src.slice(0, 2000)
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*|\n)*\s*['"]use client['"]/.test(head)
}

// ---------------------------------------------------------------------------
// RULE 1: next/dynamic from a Server Component
// ---------------------------------------------------------------------------

const srcFiles = walk(path.join(ROOT, 'src'))

for (const file of srcFiles) {
  const src = fs.readFileSync(file, 'utf8')
  if (!/from\s+['"]next\/dynamic['"]/.test(src)) continue

  // Find the local binding next/dynamic was imported as (default import).
  const m = src.match(/import\s+(\w+)\s+from\s+['"]next\/dynamic['"]/)
  if (!m) continue
  const binding = m[1]

  // Is that binding actually CALLED in this file? Re-exporting the symbol is fine.
  const called = new RegExp(`\\b${binding}\\s*\\(`).test(src)
  if (!called) continue

  if (!isClientComponent(src)) {
    failures.push(
      `RULE 1  ${rel(file)}\n` +
      `        calls ${binding}() from next/dynamic but has no 'use client' directive.\n` +
      `        Next.js does not code-split a Client Component dynamically imported\n` +
      `        from a Server Component, so this import splits nothing.\n` +
      `        Fix: move the dynamic import into a thin 'use client' wrapper\n` +
      `        (see src/components/features/events/m5-events-map-lazy.tsx).`,
    )
  }
}

// ---------------------------------------------------------------------------
// RULE 2: heavy subsystems statically imported by a hot route
// ---------------------------------------------------------------------------

/**
 * Each entry: a route file that must never carry a VALUE import of the module.
 * Type-only imports are permitted and explicitly tested for, because they are
 * erased at compile time and cost zero bytes.
 */
const HOT_ROUTE_RULES = [
  {
    route: 'src/app/events/[slug]/page.tsx',
    forbidden: [
      { module: '@/components/checkout/seat-selector', subsystem: 'the Canvas seating engine' },
      { module: '@/components/features/events/venue-map', subsystem: 'the Google Maps venue map' },
    ],
  },
]

for (const rule of HOT_ROUTE_RULES) {
  const file = path.join(ROOT, rule.route)
  if (!fs.existsSync(file)) {
    failures.push(`RULE 2  ${rule.route} not found. Update HOT_ROUTE_RULES if the route moved.`)
    continue
  }
  const src = fs.readFileSync(file, 'utf8')

  for (const { module: mod, subsystem } of rule.forbidden) {
    // Match any import statement pulling from this module specifier.
    //
    // The clause pattern forbids the token `from` inside itself. Without that,
    // the non-greedy capture happily starts at an EARLIER import statement and
    // runs all the way down to this module's `from`, so the clause under test
    // belongs to the wrong statement. That produced a false positive against a
    // correctly type-only import on first run of this guard.
    const escaped = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const importRe = new RegExp(
      `import\\s+((?:(?!\\bfrom\\b)[\\s\\S])*?)\\s+from\\s+['"]${escaped}['"]`,
      'g',
    )
    let match
    while ((match = importRe.exec(src)) !== null) {
      const clause = match[1]
      const isTypeOnly = /^\s*type\s/.test(clause)
      // A braced clause whose every specifier is prefixed with `type` is also erased.
      const braced = clause.match(/\{([\s\S]*)\}/)
      const allSpecifiersTyped =
        braced &&
        braced[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .every(s => /^type\s/.test(s))

      if (!isTypeOnly && !allSpecifiersTyped) {
        failures.push(
          `RULE 2  ${rule.route}\n` +
          `        statically imports a VALUE from ${mod}\n` +
          `        which pulls ${subsystem} into this route's client bundle for\n` +
          `        every visitor, including those the feature can never serve.\n` +
          `        Fix: import types only, and render the component through its\n` +
          `        'use client' lazy wrapper.`,
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// RULE 3: Session Replay must not be in the Sentry.init integrations array
// ---------------------------------------------------------------------------

const sentryConfig = path.join(ROOT, 'sentry.client.config.ts')
if (fs.existsSync(sentryConfig)) {
  const src = fs.readFileSync(sentryConfig, 'utf8')
  const initMatch = src.match(/Sentry\.init\(\{([\s\S]*?)\n\s*\}\)/)
  if (initMatch) {
    const initBody = initMatch[1]
    const integrationsMatch = initBody.match(/integrations\s*:\s*\[([\s\S]*?)\]/)
    if (integrationsMatch && /replayIntegration/.test(integrationsMatch[1])) {
      failures.push(
        `RULE 3  sentry.client.config.ts\n` +
        `        replayIntegration() is listed in the Sentry.init integrations array.\n` +
        `        That statically bundles rrweb (~304KB unminified) into the main\n` +
        `        client chunk on EVERY route. Measured cost when it was there:\n` +
        `        187KB transferred, 1,047ms evaluation, LCP render delay 3,071ms.\n` +
        `        Fix: arm it after load via armSessionReplay() in the same file.`,
      )
    }
  } else {
    failures.push('RULE 3  could not locate the Sentry.init({...}) call in sentry.client.config.ts.')
  }
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error('\nCRITICAL-PATH GUARD FAILED\n')
  for (const f of failures) console.error(f + '\n')
  console.error(`${failures.length} violation(s). These defects all look correct in review, which is why they are gated here.\n`)
  process.exit(1)
}

console.log('critical-path guard: OK')
console.log('  rule 1  no next/dynamic call from a Server Component')
console.log('  rule 2  no heavy subsystem statically imported by a hot route')
console.log('  rule 3  Session Replay is not in the Sentry.init integrations array')
