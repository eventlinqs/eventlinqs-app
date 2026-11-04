/**
 * IMPACT'S SITE OWNERSHIP CHECK (the CONTROLLER's order late on 3 November 2026, for Lawal's Ticketmaster affiliate application
 * on Impact). Impact asks for exactly <meta name="impact-site-verification" value="..." />: its own `value` attribute,
 * which React's meta type does not list and Next's metadata `other` would write as `content`, so the root layout spreads
 * this object into a <meta> in its <head>. A public value, not a secret. tests/unit/seo/impact-site-verification.test.ts.
 */
import type { MetaHTMLAttributes } from 'react'

/** The value Impact issued, also written into the apex root's own small page (src/proxy.ts). */
export const IMPACT_SITE_VERIFICATION_VALUE = '4c53e093-10be-4e4a-9e29-f256cbd89af8'

export const IMPACT_SITE_VERIFICATION = {
  name: 'impact-site-verification',
  value: IMPACT_SITE_VERIFICATION_VALUE,
} as MetaHTMLAttributes<HTMLMetaElement>
