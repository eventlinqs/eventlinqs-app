// Extract LCP element + breakdown phases for each route.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) { console.error('usage: node lh-lcp-detail.mjs <dir>'); process.exit(1) }

const order = ['home','events','city','category','event-detail','organisers','pricing','help','legal-terms','login','signup']
const files = readdirSync(dir).filter(f => f.endsWith('.report.json'))
files.sort((a,b) => order.indexOf(a.replace('.report.json','')) - order.indexOf(b.replace('.report.json','')))

for (const file of files) {
  const label = file.replace('.report.json','')
  const j = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  const a = j.audits ?? {}
  const lcp = a['largest-contentful-paint']?.numericValue
  console.log(`\n## ${label}  LCP ${lcp == null ? 'n/a' : Math.round(lcp) + 'ms'}`)

  const bd = a['lcp-breakdown-insight']
  const items = bd?.details?.items ?? []
  // First item: phases table
  const phases = items.find(it => it.type === 'table')
  if (phases) {
    console.log('  Phases:')
    for (const row of phases.items ?? []) {
      console.log(`    ${row.label}: ${Math.round(row.duration)}ms`)
    }
  }
  // Second item: node
  const node = items.find(it => it.type === 'node')
  if (node) {
    console.log(`  Element: ${node.snippet?.slice(0, 200) || node.nodeLabel?.slice(0, 200) || '(no snippet)'}`)
    console.log(`  Selector: ${node.selector?.slice(0, 200) || '(no selector)'}`)
  }
}
