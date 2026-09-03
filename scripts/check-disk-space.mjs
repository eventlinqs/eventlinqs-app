/**
 * check-disk-space.mjs - pre-build disk guard.
 *
 * A Next.js build writes gigabytes of .next output; on a near-full disk it
 * fails MID-COMPILE with "os error 112 / not enough space", producing broken
 * routes (404s) that look like code bugs. This refuses to start a local build
 * under a safe floor and tells the founder exactly how to reclaim space, so a
 * full disk fails loud and early instead of corrupting the build.
 *
 * Local only: skipped on Vercel (VERCEL set), which manages its own build disk.
 * Emergency bypass: ALLOW_LOW_DISK=1.
 */
import { statfsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIN_FREE_GB = 5
const __dirname = dirname(fileURLToPath(import.meta.url))

if (process.env.VERCEL || process.env.VERCEL_ENV) {
  process.exit(0)
}

let freeGb = NaN
try {
  const s = statfsSync(resolve(__dirname, '..'))
  freeGb = (s.bavail * s.bsize) / 1024 ** 3
} catch {
  // If we cannot read free space, do not block the build.
  process.exit(0)
}

if (freeGb >= MIN_FREE_GB) {
  console.log(`[disk] ${freeGb.toFixed(1)} GB free - ok to build.`)
  process.exit(0)
}

if (process.env.ALLOW_LOW_DISK === '1') {
  console.warn(`[disk] WARNING: only ${freeGb.toFixed(1)} GB free (< ${MIN_FREE_GB} GB), bypassed via ALLOW_LOW_DISK=1.`)
  process.exit(0)
}

console.error(
  `\n[disk] BUILD BLOCKED: only ${freeGb.toFixed(1)} GB free, below the ${MIN_FREE_GB} GB floor.\n\n` +
    `  A build under this will fail mid-compile ("not enough space", os error 112) and leave\n` +
    `  broken routes that look like code bugs. Reclaim regenerable space first:\n\n` +
    `      npm run reclaim          (this worktree's build caches + package caches)\n` +
    `      npm run reclaim -- --deep  (also THIS worktree's node_modules, costs one npm ci)\n\n` +
    `  Neither touches another worktree. If reclaim frees little, the space is not\n` +
    `  build output: check docs/ (sparse-checkout it out of worktrees that do not\n` +
    `  read it) and the Windows Update cache, which needs an elevated shell.\n\n` +
    `  Then re-run the build. Emergency bypass (not recommended): ALLOW_LOW_DISK=1.\n`,
)
process.exit(1)
