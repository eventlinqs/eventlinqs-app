/**
 * VERCEL'S OWN LIMITS ON A PROJECT'S ROUTES, AND THE JUDGE (21 November 2026; the PM's 22:40 item 2 and 23:03).
 *
 * Train AV's local gate passed a next.config.ts redirect carrying 26 'missing' conditions, and Vercel refused the
 * preview after the build, quoted: 'Builder returned invalid routes: should NOT have more than 16 items'. next build
 * accepts any number; Vercel's builder does not. These numbers are Vercel's published schema for a project's routes,
 * https://openapi.vercel.sh/vercel.json (read 21 November 2026): redirects, rewrites and headers each 'maxItems: 2048';
 * each item's has and missing 'maxItems: 16'; source and destination 'maxLength: 4096'; a condition's key and value
 * 'maxLength: 4096'; a header's key 'maxLength: 4096' and value 'maxLength: 32768'; a header rule's headers
 * 'maxItems: 1024'. Pure: the guard (../vercel-route-limits.mjs) hands it what next.config.ts returns.
 */
export const VERCEL_ROUTE_LIMITS = Object.freeze({
  itemsPerKind: 2048,
  conditions: 16,
  sourceLength: 4096,
  destinationLength: 4096,
  conditionTextLength: 4096,
  headerKeyLength: 4096,
  headerValueLength: 32768,
  headersPerRule: 1024,
})

const L = VERCEL_ROUTE_LIMITS

/** Every fault, said with the kind, the item's source and the limit, or none. */
export function routeLimitFaults({ redirects = [], rewrites = [], headers = [] }) {
  const faults = []
  const rewriteList = Array.isArray(rewrites) ? rewrites : [...(rewrites.beforeFiles ?? []), ...(rewrites.afterFiles ?? []), ...(rewrites.fallback ?? [])]
  for (const [kind, list] of [['redirects', redirects], ['rewrites', rewriteList], ['headers', headers]]) {
    if (list.length > L.itemsPerKind) faults.push(`${kind}: ${list.length} items, Vercel allows ${L.itemsPerKind}`)
    for (const item of list) {
      const at = `${kind} ${item.source ?? '(no source)'}`
      for (const key of ['has', 'missing']) {
        const conds = item[key]
        if (conds === undefined) continue
        if (!Array.isArray(conds)) { faults.push(`${at}: '${key}' is not a list`); continue }
        if (conds.length > L.conditions) faults.push(`${at}: '${key}' has ${conds.length} conditions, more than the ${L.conditions} Vercel allows`)
        for (const c of conds) {
          for (const f of ['key', 'value']) {
            if (typeof c[f] === 'string' && c[f].length > L.conditionTextLength) faults.push(`${at}: a '${key}' ${f} of ${c[f].length} characters, more than ${L.conditionTextLength}`)
          }
        }
      }
      if (typeof item.source === 'string' && item.source.length > L.sourceLength) faults.push(`${at}: a source of ${item.source.length} characters, more than ${L.sourceLength}`)
      if (typeof item.destination === 'string' && item.destination.length > L.destinationLength) faults.push(`${at}: a destination of ${item.destination.length} characters, more than ${L.destinationLength}`)
      if (kind === 'headers' && Array.isArray(item.headers)) {
        if (item.headers.length > L.headersPerRule) faults.push(`${at}: ${item.headers.length} headers, more than ${L.headersPerRule}`)
        for (const h of item.headers) {
          if (String(h.key ?? '').length > L.headerKeyLength) faults.push(`${at}: a header name of ${String(h.key).length} characters, more than ${L.headerKeyLength}`)
          if (String(h.value ?? '').length > L.headerValueLength) faults.push(`${at}: a header value of ${String(h.value).length} characters, more than ${L.headerValueLength}`)
        }
      }
    }
  }
  return faults
}
