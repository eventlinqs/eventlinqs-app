/**
 * Link-preview crawlers, and why a click from one is not a click.
 *
 * THE MEASUREMENT THIS PROTECTS. The Launch Kit's central claim to an organiser
 * is a reach panel of honestly measured numbers. Production, 8 August 2026:
 *
 *     clicks 57, views 3, conversions 0
 *     distinct visitor hashes among clicks: 55 of 57
 *     clicks by channel: 31 facebook, 26 x
 *     click visitors that also produced a view: 1 of 55
 *
 * Every single click was on a `facebook` or an `x` link, spread across 55
 * distinct visitor hashes, and almost none of them ever ran the JavaScript that
 * reports a view. That is the exact signature of a link-preview crawler fleet:
 * the moment a tracked URL is posted, Facebook and X fetch it from many
 * different addresses to build the preview card, follow the redirect, and never
 * execute a line of script.
 *
 * The redirect recorded each one as a click. So an organiser who shared their
 * event once and got no human visitors at all would be shown "57 clicks, 0
 * sales", which reads as "your audience clicked and did not buy". The truth is
 * that nobody clicked. That is worse than showing zero: it is a number that
 * points the organiser at the wrong conclusion, and it is exactly the kind of
 * flattering-but-false measurement this platform promises not to produce.
 *
 * So a crawler hit records NOTHING and sets no attribution cookie. The redirect
 * still works, because a shared link must never break, and the preview card
 * still renders, because the crawler still receives the page it asked for.
 *
 * ON FALSE POSITIVES. Treating a human as a crawler undercounts, which is the
 * safer direction of error for a panel that must never overstate, but it is
 * still an error. So the list is specific tokens rather than a loose "contains
 * bot" match, and the generic fallbacks at the end are patterns no mainstream
 * browser user agent contains.
 */

/**
 * Specific, well-known preview and search crawlers. Lower-cased comparison.
 * Ordered roughly by how much traffic each generates for a share link.
 */
const CRAWLER_TOKENS: readonly string[] = [
  // The two that produced 100 percent of production's click rows.
  'facebookexternalhit',
  'facebookcatalog',
  'facebot',
  'twitterbot',
  // Messaging apps that unfurl links.
  'whatsapp',
  'telegrambot',
  'slackbot',
  'slack-imgproxy',
  'discordbot',
  'skypeuripreview',
  'viber',
  'line/',
  // Social and community platforms.
  'linkedinbot',
  'pinterest',
  'redditbot',
  'tumblr',
  'vkshare',
  'mastodon',
  'pleroma',
  'snapchat',
  'tiktok',
  // Search engines and inspection tools.
  'googlebot',
  'google-inspectiontool',
  'googleother',
  'google-safety',
  'bingbot',
  'bingpreview',
  'duckduckbot',
  'applebot',
  'yandexbot',
  'baiduspider',
  'petalbot',
  // Embedders, validators and previewers.
  'embedly',
  'iframely',
  'quora link preview',
  'outbrain',
  'nuzzel',
  'w3c_validator',
  'developers.google.com/+/web/snippet',
  // Monitoring and performance agents that follow links.
  'lighthouse',
  'chrome-lighthouse',
  'pagespeed',
  'headlesschrome',
  // The harnesses in this repo, so a proof run never inflates a real panel.
  'url-filters-e2e',
  'search-reach-e2e',
  'follow-probe',
]

/**
 * Generic shapes that no mainstream browser user agent carries. Deliberately
 * short: a loose match here is how a real visitor gets silently dropped.
 */
const GENERIC_PATTERNS: readonly RegExp[] = [
  /\bbot\b/,
  /\bcrawler\b/,
  /\bspider\b/,
  /\bscraper\b/,
  /\bpreview\b/,
  /\bfetcher\b/,
  /\bmonitoring\b/,
]

/**
 * Is this user agent a link-preview crawler or other non-human agent?
 *
 * A MISSING user agent counts as a crawler. Every mainstream browser sends one;
 * a bare request with none is a script, and counting it as a human click is the
 * error this exists to prevent.
 */
export function isLinkPreviewCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true
  const ua = userAgent.toLowerCase()
  if (CRAWLER_TOKENS.some((token) => ua.includes(token))) return true
  return GENERIC_PATTERNS.some((pattern) => pattern.test(ua))
}
