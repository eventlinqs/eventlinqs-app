/**
 * LINK PREVIEW CRAWLERS.
 *
 * THE DEFECT THIS EXISTS TO FIX. Every messaging and social platform fetches a
 * link the moment it is pasted, so it can build the preview card. Our tracked
 * short link recorded a click for every request that carried a valid code,
 * which meant every single share booked at least one click that no person
 * made. Production was observed showing 57 clicks against 3 views: clicks come
 * from the server, views come from a browser beacon that a crawler never runs,
 * so the gap is the robots.
 *
 * That matters more than it sounds. The one claim this product makes that the
 * incumbents cannot match is honest measurement against real ticket sales. A
 * click number padded by robots is not honest measurement, and an organiser
 * who works out that the number is inflated will not trust the conversion
 * number either, even though the conversion number is sound.
 *
 * WHAT IS AND IS NOT SOURCED. The Meta and Slack strings below are quoted from
 * those companies' own published crawler pages, read 8 August 2026:
 *
 * - Meta, "Web crawlers" (developers.facebook.com/docs/sharing/webmasters/web-crawlers):
 *   "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
 *   "facebookexternalhit/1.1", "meta-externalagent/1.1", "meta-externalads/1.1"
 *   and "meta-webindexer/1.1". The page also warns that FacebookExternalHit
 *   "might bypass robots.txt when performing security or integrity checks".
 * - Slack, "Slack's robots" (api.slack.com/robots):
 *   "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" and
 *   "Slackbot 1.0 (+https://api.slack.com/robots)".
 *
 * The remaining tokens (Twitterbot, LinkedInBot, WhatsApp, Discordbot,
 * TelegramBot, Googlebot, bingbot, Pinterest, Applebot, redditbot) are the
 * strings those clients are observed to send. **I could not reach a
 * first-party published page for them this session and am not claiming one.**
 * They are included because excluding them would leave the same defect open on
 * the channels the kit ships to; if any is wrong the cost is a small number of
 * uncounted human clicks, which is the safer direction to be wrong in.
 *
 * THE LIMIT, STATED PLAINLY. A user agent is a string the client chooses. It
 * can be spoofed, in either direction: a person can present themselves as a
 * crawler and go uncounted, and a crawler can present itself as a browser and
 * be counted. This filter therefore makes the click number MUCH better and
 * does not make it perfect, and nothing downstream should be described as if
 * it were. The number that cannot be forged is a conversion, because it
 * requires a real order against a real payment, and that is the number the
 * reach panel should lead with.
 */

/** Tokens matched case-insensitively anywhere in the user agent. */
const CRAWLER_TOKENS: readonly string[] = [
  // Meta, first-party published.
  'facebookexternalhit',
  'facebookcatalog',
  'meta-externalagent',
  'meta-externalads',
  'meta-webindexer',
  // Slack, first-party published.
  'slackbot',
  // Observed, no first-party page reached this session.
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'discordbot',
  'telegrambot',
  'pinterest',
  'redditbot',
  'applebot',
  'googlebot',
  'bingbot',
  'yandexbot',
  'duckduckbot',
  'embedly',
  'quora link preview',
  'vkshare',
  'skypeuripreview',
  'developers.google.com/+/web/snippet',
  // Generic automation that is never a person tapping a poster link.
  'headlesschrome',
  'lighthouse',
  'chrome-lighthouse',
  'bot/',
  'spider',
  'crawler',
  'preview',
]

/**
 * True when the request is a link-preview fetch or a crawler rather than a
 * person. Callers should still SERVE the request normally, because a crawler
 * that cannot follow the link produces no preview card; they should simply not
 * count it.
 */
export function isPreviewCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) {
    // No user agent at all is not a browser. Every mainstream browser sends
    // one; an empty string is a script.
    return true
  }
  const ua = userAgent.toLowerCase()
  return CRAWLER_TOKENS.some(token => ua.includes(token))
}

/**
 * How long two clicks from the same visitor on the same link are treated as
 * one. A person who taps a link, comes back and taps it again inside the hour
 * is one interested person, not two, and a poster in a venue window scanned
 * repeatedly by the same phone is one scan. An hour is short enough that a
 * genuine return visit later in the day still counts.
 */
export const CLICK_DEDUPE_WINDOW_SECONDS = 60 * 60
