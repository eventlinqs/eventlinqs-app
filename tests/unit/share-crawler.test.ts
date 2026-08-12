import { describe, expect, it } from 'vitest'
import { CLICK_DEDUPE_WINDOW_SECONDS, isPreviewCrawler } from '@/lib/broadcast/crawler'

/**
 * The click number is the one an organiser looks at first, and it was padded
 * by robots: every platform fetches a link the moment it is pasted, and the
 * short-link route counted every one of those fetches as a click.
 *
 * The strings below marked "published" are quoted from those companies' own
 * crawler pages. The rest are the observed strings, which is stated in the
 * module rather than dressed up as a citation.
 */

describe('link preview crawlers are not people', () => {
  it('catches the crawlers whose user agent those companies publish', () => {
    // Meta, developers.facebook.com/docs/sharing/webmasters/web-crawlers.
    expect(
      isPreviewCrawler('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'),
    ).toBe(true)
    expect(isPreviewCrawler('facebookexternalhit/1.1')).toBe(true)
    expect(isPreviewCrawler('meta-externalagent/1.1')).toBe(true)
    expect(isPreviewCrawler('meta-externalads/1.1')).toBe(true)
    expect(isPreviewCrawler('meta-webindexer/1.1')).toBe(true)
    // Slack, api.slack.com/robots.
    expect(isPreviewCrawler('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)')).toBe(true)
    expect(isPreviewCrawler('Slackbot 1.0 (+https://api.slack.com/robots)')).toBe(true)
  })

  it('catches the observed crawlers on the channels the kit ships to', () => {
    expect(isPreviewCrawler('Twitterbot/1.0')).toBe(true)
    expect(isPreviewCrawler('LinkedInBot/1.0 (compatible; Mozilla/5.0)')).toBe(true)
    expect(isPreviewCrawler('WhatsApp/2.23.20.0')).toBe(true)
    expect(isPreviewCrawler('Mozilla/5.0 (compatible; Discordbot/2.0)')).toBe(true)
    expect(isPreviewCrawler('TelegramBot (like TwitterBot)')).toBe(true)
    expect(isPreviewCrawler('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true)
  })

  it('treats a missing user agent as automation', () => {
    // Every mainstream browser sends one. An empty string is a script.
    expect(isPreviewCrawler(null)).toBe(true)
    expect(isPreviewCrawler('')).toBe(true)
    expect(isPreviewCrawler(undefined)).toBe(true)
  })

  it('counts a real phone opening a poster QR', () => {
    expect(
      isPreviewCrawler(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false)
    expect(
      isPreviewCrawler(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe(false)
    expect(
      isPreviewCrawler(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      ),
    ).toBe(false)
  })

  it('counts the in-app browsers a shared link actually opens in', () => {
    // Instagram and Facebook open links in their own webview, which appends a
    // token to a normal mobile user agent. Those ARE people.
    expect(
      isPreviewCrawler(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 320.0.0.0',
      ),
    ).toBe(false)
    expect(
      isPreviewCrawler(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 [FBAN/FBAV;]',
      ),
    ).toBe(false)
  })

  it('de-duplicates repeat clicks over an hour, not a day', () => {
    // A day would lose a genuine return visit; no window at all is what let a
    // readable, guessable code be padded by hand.
    expect(CLICK_DEDUPE_WINDOW_SECONDS).toBe(3600)
  })
})
