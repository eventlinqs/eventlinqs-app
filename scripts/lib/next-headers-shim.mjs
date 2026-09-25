/**
 * LETS A NODE SCRIPT IMPORT A MODULE THAT REACHES `next/headers`.
 *
 * WHY IT IS NEEDED. `cookies()` is request bound. Outside a request Next has no
 * store to hand back, and outside NEXT there is no `next/headers` entry point to
 * resolve at all: a plain node script dies on the IMPORT, before any code runs,
 * with `Cannot find module .../next/headers`. That is how
 * `src/lib/consent/checkout-answer.ts` came to have no behavioural test. It is
 * the shared rule every purchase path calls, it reaches `next/headers` two
 * modules down, and nothing outside Next could load it to ask it a question.
 *
 * WHY THE ANSWER IS NOT "STOP CALLING COOKIES". The cookie genuinely is where
 * the buyer's chosen city lives, and reading it in the module that owns the rule
 * is the right place for it. The problem was never the call; it was that the
 * call sat in the middle of the rule instead of at its edge, so there was no way
 * in. `resolveDigestCityFor` is that way in, and this shim is what lets a drive
 * reach the request-bound wrapper around it as well.
 *
 * WHAT THIS DOES, AND WHAT IT MUST NEVER DO. It resolves `next/headers` to an
 * empty cookie jar and a set of empty headers, and nothing else. A jar with
 * nothing in it is the honest answer for a process that has no request, and it
 * is the answer the real `cookies()` can never give, so a script using this is
 * exercising the no-cookie path deliberately rather than by accident. It does
 * NOT invent a cookie: a drive that needs one passes it to the rule directly,
 * where a reader can see the value it is driving with.
 *
 * Use it beside the other two:
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/next-headers-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs script.mjs
 */
import { register } from 'node:module'

const HEADERS_STUB =
  'data:text/javascript,' +
  encodeURIComponent(`
    export async function cookies() {
      return {
        get() { return undefined },
        getAll() { return [] },
        has() { return false },
      }
    }
    export async function headers() { return new Headers() }
    export async function draftMode() { return { isEnabled: false } }
  `)

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      const HEADERS_STUB = ${JSON.stringify(HEADERS_STUB)}
      export async function resolve(specifier, context, next) {
        if (specifier === 'next/headers') {
          return { url: HEADERS_STUB, shortCircuit: true }
        }
        return next(specifier, context)
      }
    `),
  import.meta.url,
)
