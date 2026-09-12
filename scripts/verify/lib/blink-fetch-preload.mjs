/**
 * THE BLINK SIMULATOR. A Node preload (`--import`) for the production server
 * under scripts/verify/read-failure-blink-proof.mjs.
 *
 * WHY A PRELOAD. The Supabase URL is inlined into the server bundle at build
 * time (NEXT_PUBLIC_*), so no environment variable can point the built server
 * at a proxy that misbehaves on cue. What CAN be reached is the global fetch:
 * supabase-js resolves `fetch` from the global at call time
 * (`(...args) => fetch(...args)`, node_modules/@supabase/supabase-js/dist/index.cjs,
 * resolveFetch), so wrapping `globalThis.fetch` before the server starts puts
 * this in front of every read the server makes, with the real database on the
 * other side of it.
 *
 * WHAT IT DOES. It reads a control file on every intercepted call, so the drive
 * can change the failure mode without restarting the server:
 *
 *     off                     pass everything through
 *     once <slug> <nonce>     fail the FIRST existence read for this nonce, then pass
 *     always <slug>           fail every events read for the slug
 *
 * A matching read is a PostgREST request for `events` filtered to that slug.
 * `always` fails all of them (the layout's existence read, the page's row read,
 * the proxy's queue check), which is what an outage looks like. `once` fails
 * only the layout's existence read, `select=id&slug=eq.<slug>`, because that is
 * the read whose blink answered 404 on 12 September and the retry being proven
 * is that read's own. The failure is the exact shape the gate caught on
 * 10 September: `TypeError: fetch failed` caused by a closed socket
 * (UND_ERR_SOCKET). Every intercepted call is appended to a log file so the
 * drive can prove an injection happened and that the retry followed it.
 *
 * Local only, by construction: it is loaded only by a process the proof spawns.
 */
import { appendFileSync, readFileSync } from 'node:fs'

const CONTROL = process.env.BLINK_CONTROL_FILE
const LOG = process.env.BLINK_LOG_FILE
const realFetch = globalThis.fetch
const injectedForNonce = new Set()

function note(line) {
  if (!LOG) return
  appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`)
}

function readControl() {
  if (!CONTROL) return { mode: 'off', slug: '', nonce: '' }
  try {
    const [mode = 'off', slug = '', nonce = ''] = readFileSync(CONTROL, 'utf8').trim().split(/\s+/)
    return { mode, slug, nonce }
  } catch (error) {
    // Said, not swallowed: a control file that cannot be read means the drive
    // is not in charge of this server, and every call passes through.
    note(`control unreadable (${error.message}); passing through`)
    return { mode: 'off', slug: '', nonce: '' }
  }
}

function urlOf(input) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return typeof input?.url === 'string' ? input.url : ''
}

globalThis.fetch = async function blinkFetch(input, init) {
  const url = urlOf(input)
  const { mode, slug, nonce } = readControl()
  const matches = slug !== '' && url.includes('/rest/v1/events?') && url.includes(`slug=eq.${slug}`)
  if (matches) {
    const existenceRead = url.includes(`select=id&slug=eq.${slug}`)
    const fail = mode === 'always' || (mode === 'once' && existenceRead && !injectedForNonce.has(nonce))
    if (fail) {
      if (mode === 'once') injectedForNonce.add(nonce)
      note(`INJECTED ${mode} ${nonce} ${url}`)
      const cause = new Error('other side closed')
      cause.code = 'UND_ERR_SOCKET'
      cause.name = 'SocketError'
      throw new TypeError('fetch failed', { cause })
    }
    note(`PASSED ${mode} ${nonce} ${url}`)
  }
  return realFetch.call(globalThis, input, init)
}
