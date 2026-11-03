/**
 * IMPACT'S SITE OWNERSHIP CHECK (the CONTROLLER's 23:50 of 3 November 2026: Lawal's Ticketmaster affiliate application
 * on Impact). Impact asks for exactly <meta name="impact-site-verification" value="..." />: its own `value` attribute,
 * which React's meta type does not list and Next's metadata `other` would write as `content`, so the root layout spreads
 * this object into a <meta> in its <head>. A public value, not a secret. tests/unit/seo/impact-site-verification.test.ts.
 */
import type { MetaHTMLAttributes } from 'react'

export const IMPACT_SITE_VERIFICATION = {
  name: 'impact-site-verification',
  value: '4c53e093-10be-4e4a-9e29-f256cbd89af8',
} as MetaHTMLAttributes<HTMLMetaElement>
