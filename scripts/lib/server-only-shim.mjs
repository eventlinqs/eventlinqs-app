/**
 * LETS A NODE SCRIPT IMPORT A MODULE THAT DECLARES `import 'server-only'`.
 *
 * WHY IT IS NEEDED. `server-only` is not a package in this tree; it is an alias
 * Next resolves during its own build, which is exactly what makes it useful: a
 * client component that imports a module carrying it fails the build rather
 * than shipping a service role key to a browser. Outside Next there is nothing
 * to resolve it, so a script that loads such a module dies on the import.
 *
 * WHY THE ANSWER IS NOT "REMOVE THE IMPORT". That marker is a real protection
 * and the module it guards reads with the service role. Deleting it so a script
 * can run would be trading a build-time guarantee for a convenience, which is
 * the wrong way round.
 *
 * WHAT THIS DOES. Resolves the specifier `server-only` to an empty module and
 * nothing else. It is a NO-OP at runtime in Next as well (the real package is
 * empty and exists only to be a build marker), so a module loaded through this
 * behaves identically to the same module loaded by Next.
 *
 * Use it beside the src alias loader:
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs script.mjs
 */
/**
 * IT ALSO STUBS `@sentry/nextjs`, AND THAT IS A SECOND FACT WORTH STATING.
 *
 * `src/lib/observability/sentry.ts` imports `isInitialized` from it, which the
 * installed package only exports through Next's own build. A script loading any
 * module that reports an error therefore dies on the import, which is an absurd
 * way for a backfill to fail.
 *
 * The stub is a NO-OP that swallows nothing: a script is attached to a terminal
 * and prints its own failures, so the reporting a stubbed Sentry would have
 * done is reporting nobody needed. What it must never do is change BEHAVIOUR,
 * so it exports exactly the four names that file imports and each returns what
 * the real one returns for a client that is not initialised.
 */
import { register } from 'node:module'

const SENTRY_STUB =
  'data:text/javascript,' +
  encodeURIComponent(`
    export function captureException() { return '' }
    export function captureMessage() { return '' }
    export function init() {}
    export function isInitialized() { return false }
  `)

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      const SENTRY_STUB = ${JSON.stringify(SENTRY_STUB)}
      export async function resolve(specifier, context, next) {
        if (specifier === 'server-only' || specifier === 'client-only') {
          return { url: 'data:text/javascript,export{}', shortCircuit: true }
        }
        if (specifier === '@sentry/nextjs') {
          return { url: SENTRY_STUB, shortCircuit: true }
        }
        return next(specifier, context)
      }
    `),
  import.meta.url,
)
