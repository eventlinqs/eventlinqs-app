/**
 * SPF, DKIM AND DMARC FOR THE SENDING DOMAIN, CHECKED BEFORE ANY LIVE SEND (window 6, 28 October 2026; the engine plan:
 * "SPF, DKIM and DMARC checked before the first send"). outreach_sender cannot be switched to live without a passing
 * check from the last 7 days (migration 20261028213001), and this is what writes that check.
 *
 * WHAT PASSES, each from its primary source, read 28 October 2026:
 *   SPF    one TXT record at the domain beginning v=spf1 that includes spf.protection.outlook.com and ends -all or ~all:
 *          "Most Microsoft 365 organizations require include:spf.protection.outlook.com in the SPF TXT record", and
 *          "only one SPF record is allowed per domain or subdomain".
 *          https://learn.microsoft.com/en-us/defender-office-365/email-authentication-spf-configure
 *   DKIM   CNAME records selector1._domainkey and selector2._domainkey: "The values are the same for all Microsoft 365
 *          organizations", pointing into *.dkim.mail.microsoft (or *.onmicrosoft.com in older tenants).
 *          https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dkim-configure
 *   DMARC  a TXT record at _dmarc.<domain> whose v tag "MUST have the value of DMARC1", with a p tag.
 *          https://www.rfc-editor.org/rfc/rfc7489.html sections 6.1 and 6.3
 *
 * DNS is injected so the rules are tested without the network.
 */
import { promises as nodeDns } from 'node:dns'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Admin = SupabaseClient<Database>
export type Resolver = { txt: (name: string) => Promise<string[]>; cname: (name: string) => Promise<string[]> }

export const systemResolver: Resolver = {
  txt: async (name) => (await nodeDns.resolveTxt(name)).map((chunks) => chunks.join('')),
  cname: (name) => nodeDns.resolveCname(name),
}

export type DnsCheck = { ok: boolean; spf: string; dkim: string; dmarc: string; checkedAt: string; domain: string }

/** A failed lookup, as distinct from a record that is not there. */
class LookupFailed extends Error {}

/**
 * Only "no such name" and "no such record" mean absent. Any other error (a refused or timed out resolver) is a lookup
 * that failed, and the check says so rather than reporting the record missing: on 28 October this laptop's resolver
 * (127.0.0.1) refused every query, and a first version reported all three records absent while they were all there.
 */
async function lookup<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    if (code === 'ENODATA' || code === 'ENOTFOUND') return []
    throw new LookupFailed(`lookup failed (${code || (error as Error).message})`)
  }
}

export async function checkSendingDomain(domain: string, dns: Resolver = systemResolver, now = new Date()): Promise<DnsCheck> {
  try {
    return await judge(domain, dns, now)
  } catch (error) {
    if (!(error instanceof LookupFailed)) throw error
    const reason = `UNKNOWN: ${error.message}; nothing was judged`
    return { ok: false, spf: reason, dkim: reason, dmarc: reason, checkedAt: now.toISOString(), domain }
  }
}

async function judge(domain: string, dns: Resolver, now: Date): Promise<DnsCheck> {
  const spfRecords = (await lookup(dns.txt(domain))).filter((r) => /^v=spf1\b/i.test(r.trim()))
  let spf: string
  if (spfRecords.length === 0) spf = 'FAIL: no SPF record'
  else if (spfRecords.length > 1) spf = `FAIL: ${spfRecords.length} SPF records; one is allowed`
  else if (!/\binclude:spf\.protection\.outlook\.com\b/i.test(spfRecords[0])) spf = 'FAIL: does not include spf.protection.outlook.com'
  else if (!/[-~]all\s*$/i.test(spfRecords[0].trim())) spf = 'FAIL: does not end -all or ~all'
  else spf = `PASS: ${spfRecords[0].trim()}`

  const selectors = await Promise.all(['selector1', 'selector2'].map(async (s) => [s, await lookup(dns.cname(`${s}._domainkey.${domain}`))] as const))
  const badSelector = selectors.find(([, targets]) => !targets.some((t) => /\.(dkim\.mail\.microsoft|onmicrosoft\.com)\.?$/i.test(t)))
  const dkim = badSelector ? `FAIL: ${badSelector[0]}._domainkey.${domain} is not a Microsoft 365 DKIM CNAME` : `PASS: ${selectors.map(([s, t]) => `${s} -> ${t[0]}`).join(', ')}`

  const dmarcRecords = (await lookup(dns.txt(`_dmarc.${domain}`))).filter((r) => /^v=DMARC1\b/.test(r.trim()))
  const dmarc =
    dmarcRecords.length !== 1
      ? `FAIL: ${dmarcRecords.length} DMARC records at _dmarc.${domain}`
      : /\bp=(none|quarantine|reject)\b/i.test(dmarcRecords[0])
        ? `PASS: ${dmarcRecords[0].trim()}`
        : 'FAIL: the DMARC record has no p= policy'

  const ok = [spf, dkim, dmarc].every((r) => r.startsWith('PASS'))
  return { ok, spf, dkim, dmarc, checkedAt: now.toISOString(), domain }
}

/** Check the sender's own domain and write the result to outreach_sender. Never changes the mode. */
export async function recordSendingDomainCheck(db: Admin, dns: Resolver = systemResolver, now = new Date()): Promise<DnsCheck> {
  const sender = await db.from('outreach_sender').select('from_address').eq('id', true).single()
  if (sender.error) throw new Error(`outreach_sender: ${sender.error.message}`)
  const domain = sender.data.from_address.split('@')[1]
  const check = await checkSendingDomain(domain, dns, now)
  const written = await db
    .from('outreach_sender')
    .update({ dns_ok: check.ok, dns_checked_at: check.checkedAt, dns_result: check })
    .eq('id', true)
  if (written.error) throw new Error(`writing the DNS check: ${written.error.message}`)
  return check
}
