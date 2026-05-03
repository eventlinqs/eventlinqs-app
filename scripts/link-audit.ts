import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

/**
 * link-audit - scan src/ for href="..." patterns, then compare against
 * the routes actually present under src/app. Reports any internal link
 * that does not resolve to a page.tsx.
 *
 * Diagnostic only. Not part of the build pipeline.
 */

const ROOT = path.resolve(process.cwd())
const SRC  = path.join(ROOT, 'src')
const APP  = path.join(SRC, 'app')

interface FoundLink {
  href: string
  file: string
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const s = statSync(full)
    if (s.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

function collectLinks(): FoundLink[] {
  const files = walk(SRC)
  const links: FoundLink[] = []
  // Match both JSX attribute form (href="...") and object-literal form (href: '...')
  const hrefRe = /href\s*[=:]\s*["'`]([^"'`]+)["'`]/g
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    let m: RegExpExecArray | null
    while ((m = hrefRe.exec(text)) !== null) {
      const href = m[1]
      if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) continue
      if (!href.startsWith('/')) continue
      // skip template strings with interpolation
      if (href.includes('${')) continue
      links.push({ href, file: path.relative(ROOT, f) })
    }
  }
  return links
}

function collectRoutes(): Set<string> {
  const routes = new Set<string>(['/'])
  function scan(dir: string, rel: string) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      const s = statSync(full)
      if (s.isDirectory()) {
        let seg = name
        if (seg.startsWith('(') && seg.endsWith(')')) seg = ''
        const nextRel = seg ? `${rel}/${seg}` : rel
        scan(full, nextRel)
      } else if (/^page\.(ts|tsx|js|jsx)$/.test(name)) {
        const route = rel === '' ? '/' : rel
        routes.add(route)
      }
    }
  }
  scan(APP, '')
  return routes
}

function routeMatches(href: string, routes: Set<string>): boolean {
  const [pathname] = href.split('?')
  const normalised = pathname.replace(/\/$/, '') || '/'
  if (routes.has(normalised) || routes.has(pathname)) return true
  for (const r of routes) {
    if (!r.includes('[')) continue
    const regex = new RegExp(
      '^' + r.replace(/\[\.\.\..+?\]/g, '.+').replace(/\[.+?\]/g, '[^/]+') + '$'
    )
    if (regex.test(normalised)) return true
  }
  return false
}

function main() {
  const links  = collectLinks()
  const routes = collectRoutes()
  const seen   = new Set<string>()
  const dead: FoundLink[] = []
  for (const l of links) {
    const [pathname] = l.href.split('?')
    if (seen.has(pathname)) continue
    seen.add(pathname)
    if (!routeMatches(pathname, routes)) dead.push(l)
  }
  console.log(`Scanned ${links.length} href occurrences (${seen.size} unique).`)
  console.log(`Found ${routes.size} routes under src/app/.`)
  if (dead.length === 0) {
    console.log('All internal links resolve.')
    return
  }
  console.log(`\n${dead.length} dead link(s):`)
  for (const d of dead) console.log(`  ${d.href}  <-  ${d.file}`)
}

main()
