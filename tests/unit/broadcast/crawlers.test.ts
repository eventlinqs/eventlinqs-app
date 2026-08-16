import { describe, it, expect } from 'vitest'
import { isLinkPreviewCrawler } from '@/lib/broadcast/crawlers'

/**
 * WHY THIS MATTERS MORE THAN IT LOOKS. The Launch Kit's central claim to an
 * organiser is a reach panel of honestly measured numbers. On production, 8
 * August 2026, ALL 57 recorded clicks were on facebook and x links across 55
 * distinct visitor hashes, and only 1 of those 55 ever ran the view beacon:
 * a link-preview crawler fleet, not an audience.
 *
 * Shown to that organiser, "57 clicks, 0 sales" reads as "they clicked and did
 * not buy". The truth was that nobody clicked. A number that points someone at
 * the wrong conclusion is worse than no number.
 *
 * The direction of error matters too. Treating a human as a crawler undercounts
 * (safe for a panel that must never overstate); treating a crawler as a human
 * overstates (the defect). So the browser cases below are the ones that must
 * never regress.
 */
describe('link preview crawler detection', () => {
  describe('the agents that produced every click on production', () => {
    it.each([
      ['Facebook', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
      ['Facebook catalog', 'facebookcatalog/1.0'],
      ['X / Twitter', 'Twitterbot/1.0'],
    ])('detects %s', (_name, ua) => {
      expect(isLinkPreviewCrawler(ua)).toBe(true)
    })
  })

  describe('the other unfurlers a shared link meets', () => {
    it.each([
      ['WhatsApp', 'WhatsApp/2.19.81 A'],
      ['Telegram', 'TelegramBot (like TwitterBot)'],
      ['Slack', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
      ['Discord', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'],
      ['LinkedIn', 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)'],
      ['Reddit', 'redditbot/1.0'],
      ['Skype', 'SkypeUriPreview Preview/0.5'],
      ['Google', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
      ['Bing', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
      ['Apple', 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Version/8.0 Safari/600 Applebot/0.1'],
      ['Embedly', 'Embedly/1.0'],
      ['Lighthouse', 'Mozilla/5.0 Chrome-Lighthouse'],
    ])('detects %s', (_name, ua) => {
      expect(isLinkPreviewCrawler(ua)).toBe(true)
    })
  })

  describe('a missing user agent', () => {
    it('counts as a crawler, because every mainstream browser sends one', () => {
      expect(isLinkPreviewCrawler(null)).toBe(true)
      expect(isLinkPreviewCrawler(undefined)).toBe(true)
      expect(isLinkPreviewCrawler('')).toBe(true)
    })
  })

  describe('REAL BROWSERS, which must never be dropped', () => {
    // If any of these ever returns true, real people stop being counted and
    // the panel silently understates an organiser's reach.
    it.each([
      ['Chrome on Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'],
      ['Safari on iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'],
      ['Safari on Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'],
      ['Chrome on Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'],
      ['Firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'],
      ['Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'],
      ['Samsung Internet', 'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36'],
      ['Instagram in-app browser', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.35.95'],
      ['Facebook in-app browser', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/468.0.0.47.108]'],
    ])('does NOT drop %s', (_name, ua) => {
      expect(isLinkPreviewCrawler(ua)).toBe(false)
    })
  })

  describe('the in-app browser distinction, which is the subtle one', () => {
    it('separates the Facebook CRAWLER from a human inside the Facebook app', () => {
      // Both contain "facebook". Only one is a person, and that person is
      // exactly the audience a shared link is meant to reach.
      expect(isLinkPreviewCrawler('facebookexternalhit/1.1')).toBe(true)
      expect(
        isLinkPreviewCrawler(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/468.0.0.47.108]',
        ),
      ).toBe(false)
    })
  })
})
