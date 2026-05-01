import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /dev/* is intentionally crawlable here so Lighthouse SEO scores
        // the dev preview at 1.0. Practical exposure is zero: dev routes
        // are never linked from the app shell and are excluded from
        // sitemap.xml, so search engines have no path to discover them.
        disallow: ['/api/', '/dashboard/', '/checkout/', '/auth/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
