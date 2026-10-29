import { describe, expect, test } from 'vitest'
import { checkSendingDomain, type Resolver } from '@/lib/outreach/dns-check'

/**
 * THE SENDING DOMAIN CHECK (src/lib/outreach/dns-check.ts). The records below are eventlinqs.com's own, read with
 * Resolve-DnsName on 28 October 2026 (C:\dev\EVIDENCE\CRM-28OCT\dns-check-eventlinqs-com.txt holds the first,
 * wrong, run: this laptop's Node resolver refused every query and the check then called all three records absent).
 */

const REAL: Record<string, { txt?: string[]; cname?: string[] }> = {
  'eventlinqs.com': { txt: ['NETORGFT20460475.onmicrosoft.com', 'v=spf1 include:spf.protection.outlook.com include:secureserver.net -all'] },
  '_dmarc.eventlinqs.com': { txt: ['v=DMARC1; p=none; rua=mailto:hello@eventlinqs.com'] },
  'selector1._domainkey.eventlinqs.com': { cname: ['selector1-eventlinqs-com._domainkey.netorgft20460475.w-v1.dkim.mail.microsoft'] },
  'selector2._domainkey.eventlinqs.com': { cname: ['selector2-eventlinqs-com._domainkey.netorgft20460475.w-v1.dkim.mail.microsoft'] },
}

const absent = () => Object.assign(new Error('queryTxt ENODATA'), { code: 'ENODATA' })
function resolver(records: typeof REAL): Resolver {
  return {
    txt: async (name) => {
      if (records[name]?.txt) return records[name].txt!
      throw absent()
    },
    cname: async (name) => {
      if (records[name]?.cname) return records[name].cname!
      throw absent()
    },
  }
}

describe('eventlinqs.com as it stands', () => {
  test('passes all three', async () => {
    const c = await checkSendingDomain('eventlinqs.com', resolver(REAL))
    expect(c.ok).toBe(true)
    expect(c.spf).toBe('PASS: v=spf1 include:spf.protection.outlook.com include:secureserver.net -all')
    expect(c.dmarc).toBe('PASS: v=DMARC1; p=none; rua=mailto:hello@eventlinqs.com')
    expect(c.dkim.startsWith('PASS: selector1 -> selector1-eventlinqs-com')).toBe(true)
  })
})

describe('what fails', () => {
  test('a refused resolver is a failed lookup, never a missing record', async () => {
    const refused: Resolver = {
      txt: async () => { throw Object.assign(new Error('queryTxt ECONNREFUSED eventlinqs.com'), { code: 'ECONNREFUSED' }) },
      cname: async () => { throw Object.assign(new Error('queryCname ECONNREFUSED'), { code: 'ECONNREFUSED' }) },
    }
    const c = await checkSendingDomain('eventlinqs.com', refused)
    expect(c.ok).toBe(false)
    expect(c.spf).toBe('UNKNOWN: lookup failed (ECONNREFUSED); nothing was judged')
  })
  test('no DMARC record', async () => {
    const { ['_dmarc.eventlinqs.com']: _gone, ...rest } = REAL
    const c = await checkSendingDomain('eventlinqs.com', resolver(rest))
    expect(c).toMatchObject({ ok: false, dmarc: 'FAIL: 0 DMARC records at _dmarc.eventlinqs.com' })
  })
  test('two SPF records', async () => {
    const c = await checkSendingDomain('eventlinqs.com', resolver({ ...REAL, 'eventlinqs.com': { txt: ['v=spf1 include:spf.protection.outlook.com -all', 'v=spf1 -all'] } }))
    expect(c.spf).toBe('FAIL: 2 SPF records; one is allowed')
  })
  test('SPF without Microsoft 365', async () => {
    const c = await checkSendingDomain('eventlinqs.com', resolver({ ...REAL, 'eventlinqs.com': { txt: ['v=spf1 include:secureserver.net -all'] } }))
    expect(c.spf).toBe('FAIL: does not include spf.protection.outlook.com')
  })
  test('a DKIM selector not pointing at Microsoft', async () => {
    const c = await checkSendingDomain('eventlinqs.com', resolver({ ...REAL, 'selector2._domainkey.eventlinqs.com': { cname: ['dkim.example.net'] } }))
    expect(c.dkim).toBe('FAIL: selector2._domainkey.eventlinqs.com is not a Microsoft 365 DKIM CNAME')
  })
})
