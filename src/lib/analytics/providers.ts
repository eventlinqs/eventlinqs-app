/**
 * EVERY THIRD-PARTY MEASUREMENT SCRIPT THE PLATFORM MAY LOAD, IN ONE LIST.
 *
 * Close-out AN1. This is the list the consent gate reads, the list the privacy
 * page names, and the list the registered guard refuses to find anywhere else.
 * A provider that is not here cannot be loaded, and a provider that is here
 * cannot be loaded without consent: those are the same fact expressed once.
 *
 * WHY A REGISTRY AND NOT FOUR `<Script>` TAGS. Four tags is four chances for
 * one of them to end up outside the gate, and the failure is silent in the
 * worst direction: the page still works, the data still flows, and the platform
 * is loading an advertising tracker for someone who said no. One list means the
 * guard has one thing to check and the privacy page has one thing to read.
 *
 * PLAUSIBLE IS DELIBERATELY NOT IN THIS LIST, and the reason belongs beside it
 * rather than in a commit message. Plausible is cookieless and stores nothing on
 * the device: it is the platform's own traffic measurement, not a tracker, and
 * the cookie policy has said so since Batch 9.2. The four below are different in
 * kind. PostHog identifies a person across sessions; GA4, Google Ads and Meta
 * exist to follow somebody somewhere else. Putting Plausible behind the same
 * banner would mean the platform could not count its own pages until a visitor
 * agreed to advertising, which is a worse privacy posture dressed as a better
 * one. If Plausible is ever configured to set a cookie, it moves into this list.
 *
 * OFF BY DEFAULT AND OFF WITHOUT AN IDENTIFIER. Each provider needs its own
 * environment value, which only the owner can mint, so the honest default on
 * every environment that has not been given one is that nothing loads at all.
 */

/** The consent categories a visitor decides between. */
export const CONSENT_CATEGORIES = ['analytics', 'advertising'] as const
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number]

export interface AnalyticsProvider {
  /** Stable id, used in the consent record and by the guard. */
  id: 'posthog' | 'ga4' | 'google-ads' | 'meta-pixel'
  /** What a person is agreeing to, in the words the privacy page uses. */
  label: string
  category: ConsentCategory
  /** The environment value only the owner can mint. Absent means never loaded. */
  envVar: string
  /**
   * Every host this provider talks to. The guard fails the build if a request
   * can reach one of these without consent, and the driven proof watches the
   * network log for exactly these names.
   */
  hosts: string[]
}

export const ANALYTICS_PROVIDERS: AnalyticsProvider[] = [
  {
    id: 'posthog',
    label: 'PostHog, for the product funnels',
    category: 'analytics',
    envVar: 'NEXT_PUBLIC_POSTHOG_KEY',
    hosts: ['posthog.com', 'i.posthog.com', 'eu.posthog.com', 'us.posthog.com', 'app.posthog.com'],
  },
  {
    id: 'ga4',
    label: 'Google Analytics 4, for advertising attribution',
    category: 'advertising',
    envVar: 'NEXT_PUBLIC_GA4_MEASUREMENT_ID',
    hosts: ['googletagmanager.com', 'google-analytics.com', 'analytics.google.com'],
  },
  {
    id: 'google-ads',
    label: 'Google Ads, for conversion measurement',
    category: 'advertising',
    envVar: 'NEXT_PUBLIC_GOOGLE_ADS_ID',
    hosts: ['googleadservices.com', 'googlesyndication.com', 'doubleclick.net'],
  },
  {
    id: 'meta-pixel',
    label: 'Meta pixel, for conversion measurement',
    category: 'advertising',
    envVar: 'NEXT_PUBLIC_META_PIXEL_ID',
    hosts: ['connect.facebook.net', 'facebook.com/tr'],
  },
]

/** Every host across every provider, for the guard and the driven network log. */
export const ANALYTICS_HOSTS: string[] = [...new Set(ANALYTICS_PROVIDERS.flatMap(p => p.hosts))]

/** True when a URL reaches any provider. Used by the drive's network log. */
export function isAnalyticsHost(url: string): boolean {
  const lower = url.toLowerCase()
  return ANALYTICS_HOSTS.some(host => lower.includes(host))
}

export function providersFor(category: ConsentCategory): AnalyticsProvider[] {
  return ANALYTICS_PROVIDERS.filter(p => p.category === category)
}
