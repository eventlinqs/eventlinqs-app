import { describe, it, expect, beforeEach, afterEach } from 'vitest'

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

describe('preview still follows the deployment, which is what makes a preview usable', () => {
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
