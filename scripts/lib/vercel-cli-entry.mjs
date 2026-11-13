/**
 * THE VERCEL CLI AS A NODE PROGRAM, FOUND BY ITS OWN PACKAGE (14 November 2026). On Windows the global install's
 * `vercel.cmd` shim needs cmd.exe, so the scripts run the package's entry with this process's Node. They used to assume
 * that entry was `dist/index.js`; CLI 65 ships it as `dist/vc.js` (its package.json: "bin": { "vercel": "./dist/vc.js" }),
 * so the lookup found nothing, the fallback spawned `vercel` with no shell, the spawn failed with no output, and proof 1
 * of Lawal's database step read 'vercel env pull for production failed: exit null' (13 and 14 November). The entry is now
 * read from the package's own `bin`, the field npm itself installs the command from, with `dist/index.js` kept for an
 * older install. tests/unit/ops/vercel-cli-entry.test.ts holds both layouts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The CLI's entry script inside one installed `vercel` package folder, or null when there is none. */
export function vercelEntryIn(root) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && (pkg.bin.vercel ?? pkg.bin.vc)
    if (typeof bin === 'string') {
      const entry = join(root, bin)
      if (existsSync(entry)) return entry
    }
  } catch (error) {
    // No package.json here is the ordinary case (no install at this root): try the old layout below. Anything else, a
    // package.json that cannot be read or parsed, is said, so a broken install is never mistaken for a missing one.
    if (error?.code !== 'ENOENT') console.warn(`[vercel-cli-entry] ${join(root, 'package.json')} could not be read: ${error?.message ?? error}`)
  }
  const old = join(root, 'dist', 'index.js')
  return existsSync(old) ? old : null
}

/** The installed CLI, the global npm install first, then the project's own; null when neither is there. */
export function vercelCliEntry(projectRoot, env = process.env) {
  const roots = []
  if (env.APPDATA) roots.push(join(env.APPDATA, 'npm', 'node_modules', 'vercel'))
  roots.push(join(projectRoot, 'node_modules', 'vercel'))
  for (const root of roots) {
    const entry = vercelEntryIn(root)
    if (entry) return { file: process.execPath, prefix: [entry] }
  }
  return null
}
