/**
 * THE 410 PAGE FOR A DELETED EVENT.
 *
 * A deleted event's URL answers 410 Gone (docs/EVENT-LIFECYCLE.md, close-out
 * C13.6): not a 404, which says "never existed", and never a 200 with an empty
 * page, which search engines index as a soft 404. A page component cannot set
 * a 410 (the installed Next docs: `not-found` renders 404, a route handler or
 * the proxy returns any status), so the proxy answers directly from the
 * tombstone with this body.
 *
 * WHY A STRING AND NOT A COMPONENT. The proxy runs before rendering and must
 * not pull the React tree into the request path of every event page. This is
 * one small, static, branded document: the brand tokens are inherited from
 * globals.css by value (canvas #FAFAF7, ink-900 #0A1628, ink-600 #4A4A4A,
 * gold-800 #6F5409 for gold text on a light surface, gold-400 #E8B738 for the
 * focus ring only), because a document served from the proxy has no stylesheet.
 * It carries no event title: a deleted draft's name is not public information,
 * and the tombstone grants anon the slug and the date only.
 *
 * Copy law: Australian English, no exclamation marks, no dashes.
 */

export const GONE_STATUS = 410

export const GONE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=300, s-maxage=3600',
  'x-robots-tag': 'noindex, nofollow',
} as const

/** The whole document. Pure, so it is unit tested byte for byte. */
export function renderGoneHtml(): string {
  return [
    '<!doctype html>',
    '<html lang="en-AU">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    '<title>This event has been removed | EventLinqs</title>',
    '<style>',
    'html,body{margin:0;background:#FAFAF7;color:#0A1628;font-family:"Hanken Grotesk",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}',
    'main{max-width:40rem;margin:0 auto;padding:6rem 1.25rem 4rem;text-align:center}',
    '.eyebrow{font-size:.75rem;letter-spacing:.2em;text-transform:uppercase;color:#6F5409;font-weight:700;margin:0 0 .75rem}',
    'h1{font-family:Archivo,"Hanken Grotesk",system-ui,sans-serif;font-size:1.875rem;line-height:1.15;letter-spacing:-.01em;font-weight:800;margin:0}',
    'p{font-size:1rem;line-height:1.6;color:#4A4A4A;margin:1rem auto 0;max-width:34rem}',
    'a.cta{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:2rem;padding:0 1.5rem;border-radius:9999px;background:#0A1628;color:#fff;font-weight:600;font-size:.9375rem;text-decoration:none}',
    'a.cta:hover{background:#13243f}',
    'a.cta:focus-visible{outline:2px solid #E8B738;outline-offset:2px}',
    'a.quiet{display:inline-block;margin-top:1rem;color:#6F5409;font-weight:600;text-decoration:underline;text-underline-offset:3px}',
    '@media (min-width:640px){h1{font-size:2.25rem}}',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<p class="eyebrow">410</p>',
    '<h1>This event has been removed</h1>',
    '<p>The organiser has deleted this event, so there is nothing to see at this address any more. If you hold a ticket to an event that is still going ahead, it is in your account.</p>',
    '<a class="cta" href="/events">Browse what is on</a>',
    '<br>',
    '<a class="quiet" href="/tickets">My tickets</a>',
    '</main>',
    '</body>',
    '</html>',
  ].join('\n')
}
