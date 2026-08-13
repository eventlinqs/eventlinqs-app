import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * THE CANONICAL HOST, PROVEN AT RUNTIME.
 *
 * scripts/guards/canonical-host.mjs is a LITERAL scanner: it finds a wrong host
 * written into a file. It cannot see this defect, because the wrong host never
 * appeared in any file. It arrived from VERCEL_PROJECT_PRODUCTION_URL, which on
 * this project is `eventlinqs.com`, and was emitted at runtime by the resolvers
 * in src/lib/site-url.ts. Every artefact printed it and every production link
 * was built on it.
 *
 * A static scan cannot catch a value that only exists in an environment
 * variable, so the class is pinned here instead, by running the resolvers under
 * a simulated production and a simulated preview.
 */
const CANONICAL = 'https://www.eventlinqs.com.au'

async function freshSiteUrl() {
  // The module reads process.env at call time, but resetModules keeps each case
  // independent of any module-level caching added later.
  const mod = await import('@/lib/site-url')
  return mod
}

const saved = { ...process.env }

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL
  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.VERCEL_ENV
  delete process.env.VERCEL_URL
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL
})

afterEach(() => {
  process.env = { ...saved }
})

describe('production resolves to the canonical host, whatever Vercel nominates', () => {
  it('ignores VERCEL_PROJECT_PRODUCTION_URL on production', async () => {
    process.env.VERCEL_ENV = 'production'
    // The exact value that caused the defect.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'eventlinqs.com'
    const { getSiteUrl, getAppUrl } = await freshSiteUrl()
    expect(getSiteUrl()).toBe(CANONICAL)
    expect(getAppUrl()).toBe(CANONICAL)
  })

  it('holds even when the nominated host is the bare .com.au or the www .com', async () => {
    process.env.VERCEL_ENV = 'production'
    for (const nominated of ['eventlinqs.com.au', 'www.eventlinqs.com', 'eventlinqs-app.vercel.app']) {
      process.env.VERCEL_PROJECT_PRODUCTION_URL = nominated
      const { getSiteUrl } = await freshSiteUrl()
      expect(getSiteUrl()).toBe(CANONICAL)
    }
  })
})

/**
 * THE GAP THE FIRST FIX LEFT OPEN.
 *
 * Pinning VERCEL_PROJECT_PRODUCTION_URL did nothing about the variable ABOVE it.
 * NEXT_PUBLIC_SITE_URL is already set on the Vercel Production environment, it
 * is consulted first, and the env manifest's production shape
 * (`brandedHttpsOrigin`, `^https://([a-z0-9-]+\.)*eventlinqs\.com(\.au)?/?$`)
 * accepts the secondary domain. So a configuration that passes every existing
 * gate could still put a 301 in front of every Stripe Connect return url, email
 * link, share link, sitemap entry and canonical tag on production, with no file
 * changed and nothing going red.
 */
describe('production refuses a non-canonical explicit origin', () => {
  it('ignores NEXT_PUBLIC_SITE_URL when it holds the secondary domain', async () => {
    process.env.VERCEL_ENV = 'production'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const wrong of ['https://eventlinqs.com', 'https://www.eventlinqs.com']) {
      process.env.NEXT_PUBLIC_SITE_URL = wrong
      const { getSiteUrl, getAppUrl } = await freshSiteUrl()
      expect(getSiteUrl()).toBe(CANONICAL)
      expect(getAppUrl()).toBe(CANONICAL)
    }
    warn.mockRestore()
  })

  it('ignores NEXT_PUBLIC_APP_URL too, which is the one Stripe reads', async () => {
    // getAppUrl builds the Connect return and refresh urls. Stripe does not
    // follow redirects on a return url, so a 301 here is the most expensive
    // version of this defect, not the cheapest.
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_APP_URL = 'https://eventlinqs.com'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getAppUrl } = await freshSiteUrl()
    expect(getAppUrl()).toBe(CANONICAL)
    warn.mockRestore()
  })

  it('passes a canonical value straight through, unchanged and in silence', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_SITE_URL = CANONICAL
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getSiteUrl, getAppUrl } = await freshSiteUrl()
    expect(getSiteUrl()).toBe(CANONICAL)
    expect(getAppUrl()).toBe(CANONICAL)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('keeps NEXT_PUBLIC_APP_URL ranked ABOVE NEXT_PUBLIC_SITE_URL for getAppUrl', async () => {
    // THE PRECEDENCE, PINNED. getAppUrl has always read NEXT_PUBLIC_APP_URL
    // first and fallen back to NEXT_PUBLIC_SITE_URL, and getSiteUrl has always
    // read only the latter. Nothing downstream reports a swap: both values are
    // valid origins on their own, so an inversion would surface as Stripe
    // Connect returning to the wrong host, which is the expensive way to find
    // out. Asserted off production, because ON production the canonical rule
    // collapses both answers onto one host and the ordering becomes
    // unobservable.
    delete process.env.VERCEL_ENV
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.eventlinqs.com.au'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.eventlinqs.com.au'
    const { getAppUrl, getSiteUrl } = await freshSiteUrl()
    expect(getAppUrl()).toBe('https://app.eventlinqs.com.au')
    expect(getSiteUrl()).toBe('https://www.eventlinqs.com.au')
  })

  it('does not fall back to NEXT_PUBLIC_SITE_URL when APP_URL is refused', async () => {
    // The refusal must land on the canonical fallback, not quietly borrow the
    // other variable: an operator fixing one variable should not have the
    // outcome depend on the other one they did not touch.
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_APP_URL = 'https://refused.eventlinqs.com'
    process.env.NEXT_PUBLIC_SITE_URL = CANONICAL
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getAppUrl } = await freshSiteUrl()
    expect(getAppUrl()).toBe(CANONICAL)
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('NEXT_PUBLIC_APP_URL')
    warn.mockRestore()
  })

  it('says so out loud when it ignores one, naming the variable and the host', async () => {
    // A silent fallback is how the original defect survived: everything
    // downstream looked correct and the wrong host was only ever visible in the
    // finished artefact. The value here is unique to this case because the
    // module announces each misconfiguration once.
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://loud.eventlinqs.com'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getSiteUrl } = await freshSiteUrl()
    expect(getSiteUrl()).toBe(CANONICAL)
    expect(warn).toHaveBeenCalledOnce()
    const message = String(warn.mock.calls[0][0])
    expect(message).toContain('NEXT_PUBLIC_SITE_URL')
    expect(message).toContain('loud.eventlinqs.com')
    warn.mockRestore()
  })
})

describe('preview still follows the deployment, which is what makes a preview usable', () => {
  it('keeps honouring an explicit origin, exactly as it does today', async () => {
    // The production rule above must NOT leak into preview. Verified against the
    // live preview on 13 August 2026: its canonical tag reads the deployment
    // host, so NEXT_PUBLIC_SITE_URL is not set on the Preview environment and
    // the carve-out below is what actually resolves there. This case pins the
    // untouched behaviour for the day somebody does set it.
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_URL = 'eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://eventlinqs-app-git-some-other-branch.vercel.app'
    const { getSiteUrl } = await freshSiteUrl()
    expect(getSiteUrl()).toBe('https://eventlinqs-app-git-some-other-branch.vercel.app')
  })

  it('resolves links against the preview host, not production', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_URL = 'eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'eventlinqs.com'
    const { getSiteUrl, getAppUrl } = await freshSiteUrl()
    // A preview kit's draft exists only in the preview database. A link to
    // production would 404, so this carve-out is deliberate and must survive.
    expect(getSiteUrl()).toBe(
      'https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app',
    )
    expect(getAppUrl()).toBe(
      'https://eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app',
    )
  })
})

describe('the PRINTED host is canonical everywhere, including on a preview', () => {
  it('prints the canonical host on a preview, where the link host is the deployment', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_URL = 'eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app'
    const { printableHost, getSiteUrl } = await freshSiteUrl()
    expect(printableHost()).toBe('www.eventlinqs.com.au')
    // The split that makes an artefact work: the poster READS the canonical
    // host, the QR and the link RESOLVE against the deployment.
    expect(getSiteUrl()).toContain('vercel.app')
  })

  it('refuses a misconfigured NEXT_PUBLIC_SITE_URL rather than printing it', async () => {
    process.env.VERCEL_ENV = 'production'
    for (const wrong of ['https://eventlinqs.com', 'https://www.eventlinqs.com', 'not a url']) {
      process.env.NEXT_PUBLIC_SITE_URL = wrong
      const { printableHost } = await freshSiteUrl()
      expect(printableHost()).toBe('www.eventlinqs.com.au')
    }
  })

  it('accepts NEXT_PUBLIC_SITE_URL when it already IS the canonical host', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_SITE_URL = CANONICAL
    const { printableHost, getSiteUrl } = await freshSiteUrl()
    expect(printableHost()).toBe('www.eventlinqs.com.au')
    expect(getSiteUrl()).toBe(CANONICAL)
  })
})
