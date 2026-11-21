import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { MetaRefusal, type GraphCall } from '@/lib/social/meta-publisher'
import { normaliseHandle, readBackHandle, verifiedOnReadBack } from '@/lib/social/handle-readback'

/*
 * THE INSTAGRAM READ BACK (law 40 (c); the PM's 10:15 of 21 November 2026, ruling 8). A handle is verified only when its
 * own website's page is on record AND Instagram shows the same account through the Graph API's business discovery.
 */
const answering = (out: Record<string, unknown> | Error): GraphCall =>
  vi.fn(async () => {
    if (out instanceof Error) throw out
    return out
  })

describe('readBackHandle', () => {
  it('asks business discovery for the handle on our own account, and reads the same username back', async () => {
    const call = answering({ business_discovery: { id: '1789', username: 'GeelongLibraries', website: 'https://www.grlc.vic.gov.au/' }, id: '17841' })
    const r = await readBackHandle(call, '17841', '@GeelongLibraries ')
    expect(call).toHaveBeenCalledWith('GET', '17841', { fields: 'business_discovery.username(geelonglibraries){id,username,website}' })
    expect(r).toEqual({ handle: 'geelonglibraries', found: true, username: 'geelonglibraries', website: 'https://www.grlc.vic.gov.au/' })
  })

  it("Meta's own refusal is kept as the reason, and nothing is found", async () => {
    const r = await readBackHandle(answering(new MetaRefusal('Meta: Invalid user id (code 110)')), '17841', 'someone_personal')
    expect(r).toEqual({ handle: 'someone_personal', found: false, reason: 'Meta: Invalid user id (code 110)' })
  })

  it('an answer with no account, or a different account, is not found', async () => {
    expect((await readBackHandle(answering({ id: '17841' }), '17841', 'birdsbasement')).found).toBe(false)
    const other = await readBackHandle(answering({ business_discovery: { username: 'birdsbasement_fan' } }), '17841', 'birdsbasement')
    expect(other).toMatchObject({ found: false, reason: 'Instagram answered a different account (birdsbasement_fan)' })
  })

  it('a string that is not an Instagram username is never sent to Meta', async () => {
    const call = answering({})
    const r = await readBackHandle(call, '17841', 'https://instagram.com/x y')
    expect(r.found).toBe(false)
    expect(call).not.toHaveBeenCalled()
    expect(normaliseHandle('@Mts_Vic_Events')).toBe('mts_vic_events')
  })
})

describe('verifiedOnReadBack', () => {
  it('needs both: its own site on record and Instagram showing it', () => {
    const shown = { handle: 'melbrecital', found: true as const, username: 'melbrecital', website: null }
    expect(verifiedOnReadBack(shown, 'https://www.melbournerecital.com.au/')).toBe(true)
    expect(verifiedOnReadBack(shown, null)).toBe(false)
    expect(verifiedOnReadBack({ handle: 'melbrecital', found: false, reason: 'x' }, 'https://www.melbournerecital.com.au/')).toBe(false)
  })
})

describe('the route and its workflow', () => {
  const route = readFileSync('src/app/api/cron/instagram-handle-readback/route.ts', 'utf8')
  const workflow = readFileSync('.github/workflows/instagram-handle-readback.yml', 'utf8')

  it('answers only the cron secret, reads only handles from their own site not yet verified, and writes only on apply', () => {
    expect(route.indexOf('requireCronAuth(request)')).toBeLessThan(route.indexOf(".from('organisers')"))
    expect(route).toContain(".not('instagram_verified_source', 'is', null)")
    expect(route).toContain(".is('instagram_verified_at', null)")
    expect(route).toMatch(/if \(ok && apply\)/)
    expect(route).toContain("setTimeout(r, 1000)")
  })

  it('is started by hand only, dry run by default', () => {
    expect(workflow).toContain('workflow_dispatch')
    expect(workflow).not.toMatch(/^\s*schedule:/m)
    expect(workflow).toContain('default: dry-run')
  })
})
