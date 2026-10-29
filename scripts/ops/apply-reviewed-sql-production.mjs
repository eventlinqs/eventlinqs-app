/**
 * APPLY A REVIEWED DRY-RUN FILE TO PRODUCTION (operating rule 4 of 25 September 2026: a production write is a script
 * with a dry run by default, applied only when APPLY is typed, and logged in C:\dev\PRODUCTION-WRITES.txt).
 *
 * Window 6's outreach scripts write their production half as a file ending in ROLLBACK (outreach-pilot-amcf.mjs,
 * outreach-basis.mjs --production, outreach-cohort.mjs) "for Lawal's APPLY or window 4's logged apply", and nothing
 * applied such a file; this does, exactly as written and nothing else:
 *
 *   scripts\ops\with-supabase-token.ps1 node scripts/ops/apply-reviewed-sql-production.mjs <file.sql> --why "<ruling>"            dry run
 *   scripts\ops\with-supabase-token.ps1 node scripts/ops/apply-reviewed-sql-production.mjs <file.sql> --why "<ruling>" --apply    asks for APPLY
 *
 * The file must hold one begin, its statements and one closing rollback. The statements run inside one DO block, so
 * they commit together or not at all (the Management API's query endpoint is one request; a DO block is one statement).
 * A bare select cannot run in a DO block and is refused, as is a file that commits itself. The log line carries the
 * file's sha256, so the record names the exact bytes that were applied. Read the result back by direct query after.
 */
import { appendFileSync, readFileSync, readSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const REF = 'gndnldyfudbytbboxesk'
const LOG = 'C:/dev/PRODUCTION-WRITES.txt'

/** The statements of a body, split at each semicolon outside a single-quoted value ('' is a quote inside one). */
function splitStatements(body) {
  const out = []
  let cur = ''
  let quoted = false
  for (const ch of body) {
    if (ch === "'") quoted = !quoted
    if (ch === ';' && !quoted) {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** The statements of a reviewed file, or why it is refused. Pure. */
export function reviewedBody(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => !/^\s*--/.test(l))
  const sql = lines.join('\n').trim()
  if ((sql.match(/^\s*begin\s*;\s*$/gim) ?? []).length !== 1) return { refused: 'the file must hold exactly one begin' }
  if (!/^begin\s*;/i.test(sql) || !/\nrollback\s*;$/i.test(sql)) return { refused: 'the file must start with begin and end in rollback' }
  if (/^\s*commit\s*;\s*$/im.test(sql) || (sql.match(/^\s*rollback\s*;\s*$/gim) ?? []).length !== 1) {
    return { refused: 'the file must end in rollback, once, and never commit itself' }
  }
  const body = sql.replace(/^begin\s*;/i, '').replace(/\nrollback\s*;$/i, '').trim()
  if (body.includes('$apply$')) return { refused: 'a statement holds $apply$, which would end the DO block it runs in' }
  // Judged statement by statement, not line by line: an insert's own select often starts a line of its own, and
  // outreach-basis writes two statements on one line. A semicolon inside a quoted value ends nothing.
  const parts = splitStatements(body)
  // A closing select is the file's own read back (outreach-templates writes one): it runs read only after the commit.
  const readBack = parts.length > 1 && /^select\b/i.test(parts[parts.length - 1]) ? parts.pop() : null
  if (parts.some((s) => /^select\b/i.test(s.trim()))) return { refused: 'a bare select cannot run inside a DO block; take it out of the file' }
  if (parts.length === 0) return { refused: 'there is no statement between begin and rollback' }
  return { body: parts.map((s) => `${s};`).join('\n'), statements: parts.length, readBack }
}

function askLine(prompt) {
  process.stdout.write(prompt)
  const buf = Buffer.alloc(64)
  let n = 0
  try {
    n = readSync(0, buf, 0, buf.length, null)
  } catch {
    n = 0
  }
  return buf.subarray(0, n).toString('utf8').trim()
}

async function main() {
  const args = process.argv.slice(2)
  const file = args.find((a) => a.endsWith('.sql'))
  const why = args.includes('--why') ? args[args.indexOf('--why') + 1] : null
  if (!file || !why) {
    console.error('usage: node scripts/ops/apply-reviewed-sql-production.mjs <file.sql> --why "<the ruling it applies under>" [--apply]')
    return 2
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    console.error('run through scripts\\ops\\with-supabase-token.ps1')
    return 2
  }
  const bytes = readFileSync(file)
  const sha = createHash('sha256').update(bytes).digest('hex')
  const r = reviewedBody(bytes.toString('utf8'))
  if (r.refused) {
    console.log(`REFUSED: ${file}: ${r.refused}. Nothing written.`)
    return 1
  }
  const apply = args.includes('--apply')
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} on PRODUCTION (${REF}): ${file} (sha256 ${sha}), ${r.statements} statement(s), as one DO block:\n\n${r.body}\n${r.readBack ? `\nThen, read only after the commit, the file's own read back:\n${r.readBack}\n` : ''}`)
  if (!apply) {
    console.log('DRY RUN: nothing written. Add --apply to be asked for APPLY.')
    return 0
  }
  if (askLine(`Type APPLY to run these ${r.statements} statement(s) on PRODUCTION: `) !== 'APPLY') {
    console.log('NOT APPLIED: the confirmation was not APPLY; nothing was written')
    return 1
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: `do $apply$ begin\n${r.body}\nend $apply$;`, read_only: false }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.log(`REFUSED BY PRODUCTION (HTTP ${res.status}), nothing committed: ${text.slice(0, 600)}`)
    return 1
  }
  appendFileSync(LOG, `${new Date().toISOString()}  APPLY typed: APPLIED: ${file} (sha256 ${sha}, ${r.statements} statement(s), one DO block) under: ${why}\n`)
  console.log(`APPLIED: ${r.statements} statement(s) committed together; logged in ${LOG}.`)
  if (r.readBack) {
    const back = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: r.readBack, read_only: true }),
    })
    console.log(`READ BACK, the file's own select, read only (HTTP ${back.status}):\n${await back.text()}`)
  } else console.log('Read the result back by direct query.')
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main()
