/**
 * THE APPROVAL WORKFLOW FOR THE PLATFORM'S SEND (the PM's 11:55 of 19 November 2026), run on the build machine, where
 * the communication gateway lives (C:\dev\comms-gateway, Lawal's zero-bypass directive of 31 October 2026).
 *
 *   node scripts/ops/comms-approve.mjs <message.json> <draft graph id> <approved by> <approval words file> [--send]
 *
 * In order, each refusing before it acts:
 *   1. the gateway's own send-check on <message.json> must print CLEARED_TO_SEND (validate, then Lawal's approval of
 *      that exact content, recorded by `gateway.py approve`, come first, as the gateway requires);
 *   2. the hash of the message's own words (src/lib/outreach/draft-content.mjs, the same rule the route uses);
 *   3. one row in comms_send_approvals on production, written through the Management API with SUPABASE_ACCESS_TOKEN
 *      (run under with-supabase-token.ps1; never printed), naming the draft, the hash, the verdict and policy version,
 *      who approved and in what words;
 *   4. with --send, the comms workflow is started (gh workflow run comms-send-approved.yml), which has production's own
 *      route send the draft by its Graph id, and only when the draft's words still hash the same.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { draftContentHash } from '../../src/lib/outreach/draft-content.mjs'
import { PRODUCTION_PROJECT_REF } from './production-parity.mjs'
import { declareWork } from '../lib/work-report.mjs'

const GATEWAY = process.env.COMMS_GATEWAY || 'C:/dev/comms-gateway/gateway.py'

/** A SQL string literal, quotes doubled. Pure. */
export function sqlText(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

/** The one insert, from its parts. Pure, so a test reads it. */
export function approvalInsert(row) {
  return (
    'insert into public.comms_send_approvals (mailbox, graph_message_id, content_sha256, gateway_verdict, gateway_policy_version, approved_by, approval_words) values (' +
    [row.mailbox, row.graphMessageId, row.sha, 'CLEARED_TO_SEND', row.policy, row.by, row.words].map(sqlText).join(', ') +
    ') on conflict (graph_message_id) do nothing returning id;'
  )
}

async function main() {
  const [file, id, by, wordsFile] = process.argv.slice(2)
  const send = process.argv.includes('--send')
  if (!file || !id || !by || !wordsFile) {
    console.error('usage: node scripts/ops/comms-approve.mjs <message.json> <draft graph id> <approved by> <approval words file> [--send]')
    return 2
  }
  if (!/^[A-Za-z0-9+/=_-]{10,512}$/.test(id)) {
    console.error('REFUSED: not a Graph message id')
    return 2
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    console.error('REFUSED: SUPABASE_ACCESS_TOKEN is not set; run under with-supabase-token.ps1')
    return 1
  }
  let check = ''
  try {
    check = execFileSync('python', [GATEWAY, 'send-check', file], { encoding: 'utf8' })
  } catch (fault) {
    console.error(`REFUSED: the gateway's send-check did not clear it:\n${fault.stdout ?? ''}${fault.stderr ?? ''}`)
    return 1
  }
  if (!/^CLEARED_TO_SEND\b/m.test(check)) {
    console.error(`REFUSED: the gateway answered ${check.trim().slice(0, 200)}`)
    return 1
  }
  const policy = execFileSync('python', ['-c', `import sys; sys.path.insert(0, r'${GATEWAY.replace(/gateway\.py$/, '')}'); import gateway; print(gateway.load_policy()['version'])`], { encoding: 'utf8' }).trim()
  const msg = JSON.parse(readFileSync(file, 'utf8'))
  const sha = draftContentHash(msg.body)
  const words = readFileSync(wordsFile, 'utf8').trim()
  const sql = approvalInsert({ mailbox: msg.from, graphMessageId: id, sha, policy, by, words })
  const res = await fetch(`https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: false }),
  })
  const answer = await res.text()
  if (!res.ok) {
    console.error(`REFUSED: the approval was not written (HTTP ${res.status}: ${answer.slice(0, 300)})`)
    return 1
  }
  declareWork('comms-approve', { did: { 'approval recorded': 1 }, found: { 'gateway refusal': 0 }, zeroIsFine: { 'gateway refusal': 'the gateway cleared it' } })
  console.log(`[comms-approve] CLEARED_TO_SEND and recorded: ${id.slice(-12)}, words ${sha.slice(0, 12)}, by ${by} (${answer.includes('"id"') ? 'new' : 'already recorded'})`)
  if (send) {
    execFileSync('gh', ['workflow', 'run', 'comms-send-approved.yml', '--repo', 'eventlinqs/eventlinqs-app', '-f', `id=${id}`], { stdio: 'inherit' })
    console.log('[comms-approve] the comms workflow is started; read its run, then Sent Items')
  }
  return 0
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/ops/comms-approve.mjs')) {
  main().then((code) => { process.exitCode = code })
}
