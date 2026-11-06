/**
 * EVERY PRERENDERED DOCUMENT A BUILD WROTE, wherever this version of Next.js writes them (car 50, 6 November 2026).
 *
 * Built alone, Next.js 16.4 writes a prerendered page's HTML and RSC payload under .next/server/app. Built through a
 * deployment adapter, which is how Vercel builds it, the same files go to .next/server/route-cache/<kind>/<sha256 of the
 * route>/$<path>: node_modules/next/dist/server/lib/route-cache-key.js (getRouteCacheKey), used by build/index.js whenever
 * config.adapterPath is set. Car 50's preview went ERROR on Vercel after 148 pages were prerendered:
 * '[no-catalogue-in-every-document] FAIL: not one .html or .rsc document under .next/server/app'. Every guard that reads the
 * built documents reads them here, so the two layouts cannot drift apart again.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** The folders a build may hold its prerendered documents in, those that exist. */
export function builtDocumentDirs(root) {
  return [join(root, '.next', 'server', 'app'), join(root, '.next', 'server', 'route-cache')].filter((d) => existsSync(d))
}

/** Whether there is a build to read at all (either folder). */
export function builtDocumentsExist(root) {
  return builtDocumentDirs(root).length > 0
}

/** Every .html and .rsc document under either folder, as absolute paths. */
export function builtDocuments(root) {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.html') || name.endsWith('.rsc')) out.push(path)
    }
  }
  for (const dir of builtDocumentDirs(root)) walk(dir)
  return out
}
