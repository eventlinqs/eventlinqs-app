import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = '.next/static/chunks/app'
function walk(d) {
  const out = []
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.js')) out.push(p)
  }
  return out
}

const files = walk(dir)
const targets = ['5536', '44530001']
const hits = new Map()
for (const f of files) {
  const content = readFileSync(f, 'utf8')
  for (const t of targets) {
    // webpack uses (chunk_id) like "5536:" or [5536,
    const re = new RegExp(`\\b${t}\\b`)
    if (re.test(content)) {
      if (!hits.has(t)) hits.set(t, [])
      hits.get(t).push(f.replace(/\\/g, '/'))
    }
  }
}
for (const [t, fs] of hits) {
  console.log(`Chunk ${t} referenced by ${fs.length} app files:`)
  for (const f of fs.slice(0, 30)) console.log(`  ${f}`)
}
