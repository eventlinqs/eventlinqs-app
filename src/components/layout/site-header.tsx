import { detectLocation } from '@/lib/geo/detect'
import { SiteHeaderClient } from './site-header-client'

/**
 * SiteHeader — public site top navigation.
 *
 * Server wrapper that resolves the visitor's detected location (cookie →
 * Vercel geo headers → Melbourne fallback) and passes it to the client
 * inner, which owns the interactive hamburger and location picker.
 */
export async function SiteHeader() {
  const location = await detectLocation()
  return <SiteHeaderClient location={location} />
}
