// Per-route blocker extraction: LCP element, top JS bundles by main-thread time,
// CLS-shifting elements. Reads Lighthouse JSONs in the given dir.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) { console.error('usage: node lh-blockers.mjs <dir>'); process.exit(1) }

const order = ['home','events','city','category','event-detail','organisers','pricing','help','legal-terms','login','signup']
const files = readdirSync(dir).filter(f => f.endsWith('.report.json'))
files.sort((a,b) => order.indexOf(a.replace('.report.json','')) - order.indexOf(b.replace('.report.json','')))

for (const file of files) {
  const label = file.replace('.report.json','')
  const j = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  const a = j.audits ?? {}

  console.log(`\n## ${label}`)
  const perf = j.categories.performance?.score
  const lcp = a['largest-contentful-paint']?.numericValue
  const tbt = a['total-blocking-time']?.numericValue
  const cls = a['cumulative-layout-shift']?.numericValue
  console.log(`Perf ${perf == null ? 'n/a' : perf.toFixed(2)} | LCP ${lcp == null ? 'n/a' : Math.round(lcp)}ms | TBT ${tbt == null ? 'n/a' : Math.round(tbt)}ms | CLS ${cls == null ? 'n/a' : cls.toFixed(3)}`)

  // LCP element
  const lcpAudit = a['largest-contentful-paint-element'] ?? a['lcp-discovery-insight']
  if (lcpAudit?.details?.items?.length) {
    const item = lcpAudit.details.items[0]
    if (item.node) {
      console.log(`LCP element: ${item.node.nodeLabel?.slice(0,80) || item.node.snippet?.slice(0,120) || '(no label)'}`)
      if (item.node.selector) console.log(`  selector: ${item.node.selector.slice(0,120)}`)
    } else if (item.items?.length) {
      const sub = item.items[0]
      if (sub.node) {
        console.log(`LCP element: ${sub.node.nodeLabel?.slice(0,80) || sub.node.snippet?.slice(0,120) || '(no label)'}`)
        if (sub.node.selector) console.log(`  selector: ${sub.node.selector.slice(0,120)}`)
      }
    }
  }

  // Top JS bundles by main-thread time
  const bootup = a['bootup-time']
  if (bootup?.details?.items?.length) {
    console.log(`Top JS bundles by main-thread time:`)
    for (const item of bootup.details.items.slice(0, 5)) {
      const url = (item.url || '').replace(/^https?:\/\/[^/]+\//, '/')
      const total = Math.round(item.total ?? 0)
      const scripting = Math.round(item.scripting ?? 0)
      console.log(`  ${total}ms (script ${scripting}ms) - ${url.slice(0, 120)}`)
    }
  }

  // CLS contributors
  if (cls != null && cls > 0.1) {
    const lso = a['layout-shift-elements'] ?? a['layout-shifts']
    if (lso?.details?.items?.length) {
      console.log(`CLS contributors:`)
      for (const item of lso.details.items.slice(0, 3)) {
        if (item.node) console.log(`  ${item.node.nodeLabel?.slice(0,80) || '(no label)'} (score ${(item.score ?? 0).toFixed(3)})`)
      }
    }
  }

  // Render-blocking
  const rb = a['render-blocking-resources']
  if (rb?.details?.items?.length) {
    const sum = rb.details.items.reduce((s, i) => s + (i.wastedMs ?? 0), 0)
    if (sum > 50) {
      console.log(`Render-blocking: ${Math.round(sum)}ms total across ${rb.details.items.length} resources`)
    }
  }

  // Unused JS
  const uj = a['unused-javascript']
  if (uj?.details?.items?.length) {
    const totalBytes = uj.details.items.reduce((s, i) => s + (i.wastedBytes ?? 0), 0)
    if (totalBytes > 50_000) {
      console.log(`Unused JS: ${Math.round(totalBytes/1024)}KB across ${uj.details.items.length} files`)
    }
  }
}
