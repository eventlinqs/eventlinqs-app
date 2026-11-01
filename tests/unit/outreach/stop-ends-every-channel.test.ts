import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * A STOP ON ANY CHANNEL ENDS EVERY CHANNEL OF THAT ORGANISER (V3 item 5: "Unsubscribe and suppression across every
 * campaign"; 20261101071501). The rule lives in one database function every outreach path asks,
 * outreach_contact_refusal_for. This holds it in the tree: whichever migration defines that function LAST must keep the
 * organiser-wide stop, so a later rewrite cannot quietly drop it. Its behaviour is proved on TEST by
 * scripts/verify/proofs/stop-ends-every-channel-proof.sql (S0 to S6).
 */

const DIR = join(process.cwd(), 'supabase/migrations')

function lastDefinition(): { file: string; body: string } {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  let found: { file: string; body: string } | null = null
  for (const file of files) {
    const sql = readFileSync(join(DIR, file), 'utf8').replace(/\r\n/g, '\n')
    const at = sql.lastIndexOf('create or replace function public.outreach_contact_refusal_for(')
    if (at < 0) continue
    const end = sql.indexOf('$why$;', at)
    found = { file, body: sql.slice(at, end < 0 ? undefined : end) }
  }
  if (!found) throw new Error('no migration defines outreach_contact_refusal_for')
  return found
}

describe('the last definition of outreach_contact_refusal_for', () => {
  test('reads a stop or a take down from ANY contact of the organiser, on any channel', () => {
    const { file, body } = lastDefinition()
    expect(file >= '20261101071501', `${file} is older than the rule`).toBe(true)
    expect(body).toMatch(/where o\.organiser_id = c\.organiser_id and r\.outcome in \('stop', 'take_down'\)/)
  })
  test('lets through only the one confirmation, to the contact who asked', () => {
    const { body } = lastDefinition()
    expect(body).toMatch(/p_contact = v_stop\.contact_id and p_purpose = 'reply' and p_template_key in \('reply_stop', 'reply_take_down'\)/)
    expect(body).toMatch(/t\.state in \('sending', 'sent'\)/)
  })
})
