// DRILLS FOR THE CLIENT BARREL-IMPORT GUARD.
//
// A guard nobody has watched fail is a guard nobody knows works. This repo has
// already shipped one that could not fail: it scanned a string-blanked source
// view for a module specifier, which is itself a string, so it reported PASS on
// the exact defect it was written to catch. Drilling is what caught that.
//
// Each drill injects a real defect into a real file, runs the guard, asserts it
// exits non-zero AND names the offending file, then restores the file byte for
// byte. The restore runs in a finally block so an interrupted drill cannot
// leave the tree dirty.
//
// Node 20 compatible.

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const GUARD = join(ROOT, 'scripts', 'check-client-barrel-imports.mjs')

const DRILLS = [
  {
    name: 'reachable via import, NO use client directive',
    why:
      'src/lib/observability/sentry.ts carries no directive but is imported by ' +
      'src/app/error.tsx and src/app/global-error.tsx, which are platform-wide. ' +
      'A guard that only scanned files with the directive would miss it. This is ' +
      'the case that actually shipped.',
    file: 'src/lib/observability/sentry.ts',
    // Single-line anchor on purpose. An anchor spanning a newline cannot match
    // on a CRLF checkout, which is exactly how this drill first went stale.
    anchor: "import { scrubValue } from './pii-scrub'",
    inject: "import * as Sentry from '@sentry/nextjs'\nimport { scrubValue } from './pii-scrub'",
  },
  {
    name: 'the client instrumentation entry',
    why: 'instrumentation-client.ts is in the browser bundle with no directive of its own.',
    file: 'instrumentation-client.ts',
    // This file deliberately imports NO Sentry symbol any more: the SDK is
    // reached only by dynamic import inside the load handler. So the anchor is
    // the one static import it does keep.
    anchor: "import { shouldInitSentry } from '@/lib/observability/sentry-env'",
    inject:
      "import * as Sentry from '@sentry/nextjs'\n" +
      "import { shouldInitSentry } from '@/lib/observability/sentry-env'",
  },
  {
    name: 'the Sentry boot module, reached ONLY by dynamic import',
    why:
      'src/lib/observability/sentry-client-boot.ts carries the SDK and is reached ' +
      'only by import(). A guard that walks static imports alone does not see it ' +
      'at all: it appeared in the reachable set purely because ' +
      'instrumentation-client.ts also has an `import type` line for one of its ' +
      'types, and deleting that made the guard report PASS on a live barrel ' +
      'import. This drill is the one that would have caught that.',
    file: 'src/lib/observability/sentry-client-boot.ts',
    anchor: "import { init, addIntegration, captureException } from '@sentry/nextjs'",
    inject: "import * as Sentry from '@sentry/nextjs'",
  },
  {
    name: 'a package the guard has never heard of',
    why:
      'Proves the rule is "no third-party namespace imports in client code", not ' +
      'a denylist of packages somebody remembered. A denylist would have caught ' +
      '@sentry/nextjs and missed the next one.',
    file: 'src/app/error.tsx',
    anchor: "'use client'",
    inject: "'use client'\nimport * as ReactDom from 'react-dom'",
  },
  {
    name: 'a type-only namespace import is NOT a defect',
    why: 'Types are erased at build time and cost zero bytes. Flagging them would be noise.',
    file: 'src/app/error.tsx',
    anchor: "'use client'",
    inject: "'use client'\nimport type * as ReactTypes from 'react'",
    expectPass: true,
  },
]

let failures = 0

for (const drill of DRILLS) {
  const path = join(ROOT, drill.file)

  // A drill whose target file has MOVED must report, not crash. The first
  // version let readFileSync throw, so deleting sentry.client.config.ts turned
  // the whole suite into an unhandled ENOENT stack trace instead of a legible
  // "this drill is stale" line. A crash is a worse failure mode than a message,
  // because it takes the other drills down with it and tells you nothing.
  let original
  try {
    original = readFileSync(path, 'utf8')
  } catch {
    console.error(`[barrel-drill] SETUP FAILED (${drill.name}): ${drill.file} does not exist.`)
    console.error(`               The file moved or was deleted. Repoint the drill; do not delete it.`)
    failures += 1
    continue
  }

  if (!original.includes(drill.anchor)) {
    console.error(`[barrel-drill] SETUP FAILED (${drill.name}): anchor not found in ${drill.file}`)
    console.error(`               The drill is stale. Fix the anchor, do not delete the drill.`)
    failures += 1
    continue
  }

  try {
    writeFileSync(path, original.replace(drill.anchor, drill.inject), 'utf8')

    let exitCode = 0
    let output = ''
    try {
      output = execFileSync(process.execPath, [GUARD], { encoding: 'utf8', stdio: 'pipe' })
    } catch (err) {
      exitCode = err.status ?? 1
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`
    }

    if (drill.expectPass) {
      if (exitCode === 0) {
        console.log(`[barrel-drill] PASS  ${drill.name} (correctly NOT flagged)`)
      } else {
        console.error(`[barrel-drill] FAIL  ${drill.name}: guard fired on a type-only import`)
        failures += 1
      }
    } else if (exitCode !== 0 && output.includes(drill.file.replace(/\\/g, '/'))) {
      console.log(`[barrel-drill] PASS  ${drill.name} (exit ${exitCode}, named ${drill.file})`)
    } else if (exitCode !== 0) {
      console.error(
        `[barrel-drill] FAIL  ${drill.name}: guard fired but did not name ${drill.file}`,
      )
      failures += 1
    } else {
      console.error(`[barrel-drill] FAIL  ${drill.name}: guard did NOT fire on a real defect`)
      failures += 1
    }
  } finally {
    // Restore byte for byte, always, even if the drill threw.
    writeFileSync(path, original, 'utf8')
  }
}

// The guard must also pass on the clean tree, or every drill above is vacuous.
try {
  execFileSync(process.execPath, [GUARD], { encoding: 'utf8', stdio: 'pipe' })
  console.log('[barrel-drill] PASS  clean tree still passes')
} catch {
  console.error('[barrel-drill] FAIL  clean tree does NOT pass; the drills restored badly')
  failures += 1
}

if (failures > 0) {
  console.error(`\n[barrel-drill] ${failures} drill(s) failed.\n`)
  process.exit(1)
}
console.log(`\n[barrel-drill] ${DRILLS.length + 1} of ${DRILLS.length + 1} drills passed.\n`)
