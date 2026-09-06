/**
 * LOAD THE PLATFORM'S OWN TYPESCRIPT FROM A SCRIPT, WITHOUT A BUNDLER.
 *
 *   node --import ./scripts/lib/src-alias-loader.mjs scripts/verify/some-script.mjs
 *
 * WHY THIS EXISTS (close-out C3, 6 September 2026). A verification script that
 * re-types a list the product already holds is not enumerating from source, it
 * is copying from memory, and the close-out forbids exactly that. The lists
 * the Launch Kit proof needs (the card formats and their published sizes, the
 * artefact channels, the download filename rule) live in src/lib/broadcast as
 * TypeScript, and two things stop a plain `node` script importing them:
 *
 *   1. the tsconfig "@/" alias, which Node does not know; and
 *   2. the omitted ".ts" extension on every relative and aliased import, which
 *      Node's own ESM loader requires to be explicit.
 *
 * The previous inspection script tried `import('../../src/lib/broadcast/social-card-layout.ts')`
 * and wrapped it in `.catch(() => null)`. The import failed on the alias with
 * ERR_MODULE_NOT_FOUND on every run, the catch turned that into "skip the
 * check", and three verdicts were silently never produced. This hook removes
 * the reason for the catch.
 *
 * WHAT IT DOES. A module resolve hook (node:module register) that:
 *   - maps "@/x" to "<repo>/src/x";
 *   - for a specifier that resolves under src/ and names no existing file,
 *     tries ".ts", ".tsx", ".mjs", ".js", then "index" with each;
 *   - leaves every other specifier (bare packages, node: builtins, anything
 *     outside src/) to Node's default resolution.
 *
 * WHAT IT DOES NOT DO. It does not transpile. Node 24 strips types itself
 * (the runtime contract in .nvmrc, Law 9), so a module must be plain
 * TypeScript: no enums, no namespaces, no JSX, no parameter properties. The
 * modules a script should reach through this are the pure ones by design
 * (social-card-spec.ts, social-card-layout.ts, artefact-channels.ts); a module
 * that imports the Supabase client or React is the product's, not a script's.
 *
 * The hook code is passed to register() as a data: URL so this one file is
 * both the registration and the hook, with nothing to keep in step.
 */
import { register } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const SRC_ROOT = join(HERE, '..', '..', 'src')

export const COMPLETIONS = ['.ts', '.tsx', '.mjs', '.js']

/**
 * The path a specifier stands for, completed to a file that exists, or null.
 * Exported so the rule is testable without registering a hook.
 */
export function completeSourcePath(path, exists) {
  if (exists(path)) return path
  for (const ext of COMPLETIONS) if (exists(path + ext)) return path + ext
  for (const ext of COMPLETIONS) {
    const index = join(path, `index${ext}`)
    if (exists(index)) return index
  }
  return null
}

/** Where an aliased or relative specifier points before completion, or null when it is not ours. */
export function sourceTarget(specifier, parentURL, srcRoot) {
  if (specifier.startsWith('@/')) return join(srcRoot, specifier.slice(2))
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && parentURL?.startsWith('file:')) {
    const base = fileURLToPath(new URL(specifier, parentURL))
    if (base.startsWith(srcRoot)) return base
  }
  return null
}

const HOOK = `
  import { existsSync, statSync } from 'node:fs'
  import { pathToFileURL } from 'node:url'
  import { completeSourcePath, sourceTarget } from ${JSON.stringify(pathToFileURL(fileURLToPath(import.meta.url)).href)}
  const SRC_ROOT = ${JSON.stringify(SRC_ROOT)}
  const isFile = (p) => existsSync(p) && statSync(p).isFile()
  export async function resolve(specifier, context, next) {
    const target = sourceTarget(specifier, context.parentURL, SRC_ROOT)
    if (target) {
      const found = completeSourcePath(target, isFile)
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true }
    }
    return next(specifier, context)
  }
`

// Registered only when loaded through --import; a test importing the helpers
// above does not install a hook into its own process.
if (process.execArgv.some((a) => a === '--import' || a.startsWith('--import='))) {
  register(`data:text/javascript,${encodeURIComponent(HOOK)}`, pathToFileURL(HERE + '/'))
}
