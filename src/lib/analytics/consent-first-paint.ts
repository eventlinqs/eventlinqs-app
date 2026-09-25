import { CONSENT_COOKIE, CONSENT_VERSION } from './consent'

/**
 * THE CONSENT BANNER'S FIRST-PAINT CONTRACT: ONE ELEMENT ID, ONE ATTRIBUTE,
 * AND THE TWO INLINE SCRIPTS THAT DECIDE WHETHER THE STRIP IS SEEN.
 *
 * ============================================================================
 * WHY THE BANNER MOVED INTO THE SERVER HTML
 * ============================================================================
 *
 * AN1's banner shipped on 13 September 2026 as a client component inside the
 * lazily fetched measurement tree, so it could not paint until React had
 * hydrated and a second chunk had arrived. It is a full width strip of text at
 * the foot of the window, which on a phone makes it the largest contentful
 * element on the page, and it was arriving at around four seconds.
 *
 * Eight days later the push gate refused every lane's push: /events measured
 * 0.87 against its floor of 0.88, its LCP had gone from 3,279 ms to 4,007 ms,
 * and its LCP element had changed from the first rail card image to this
 * banner's paragraph. Four more gated URLs had quietly lost points the same
 * way. The full table is in the header of
 * `scripts/guards/the-consent-banner-is-in-the-first-paint.mjs`.
 *
 * ============================================================================
 * WHY A PRE-PAINT FLAG RATHER THAN A SERVER-READ COOKIE
 * ============================================================================
 *
 * The obvious repair is to read the cookie on the server and render the strip
 * only for somebody who has not answered. `consent-provider.tsx` refuses that
 * in terms, and it is right: it would make every page on the platform vary by
 * a cookie and defeat its caching, for a banner.
 *
 * So the platform's own existing answer is used instead. The motion engine
 * emits identical HTML for every viewer and a pre-paint inline script marks the
 * document `html[data-motion="1"]` before anything is painted (CLAUDE.md,
 * Motion). The same shape works here: the strip is in the HTML for everybody,
 * hidden by default, and a blocking script in the head reveals it only for a
 * visitor who has not answered. The HTML never varies, so the cache key is
 * untouched, and the decision lands before the first paint, so there is no
 * flash in either direction.
 *
 * ============================================================================
 * THE FAILURE DIRECTIONS, STATED, BECAUSE THIS IS CONSENT
 * ============================================================================
 *
 * This module READS the cookie and never writes one. Writing stays in
 * `consent-provider.tsx`, which remains the only writer, so the warning in that
 * file about two readers disagreeing cannot become two writers disagreeing.
 *
 * If this script is wrong in the ASK direction, somebody who has already
 * answered sees the strip again and answers again. If it is wrong in the SILENT
 * direction, somebody who has not answered is not asked here, and the deferred
 * React tree asks them a moment later instead. Neither direction can load a
 * measurement or advertising script, because nothing loads without the
 * provider's own decision (`gated-analytics.tsx`, and the registered
 * `no-analytics-before-consent` guard). That is why an unreadable browser falls
 * back to asking rather than to silence.
 */

/** The server rendered strip. The scripts, the CSS and the client all name it. */
export const CONSENT_SHELL_ID = 'el-consent-shell'

/** Set on `<html>` before the first paint, for a visitor who has not answered. */
export const CONSENT_ASK_ATTRIBUTE = 'data-consent'
export const CONSENT_ASK_VALUE = 'ask'

/** The space the strip reserves for itself, read by `body` and the mobile bar. */
export const CONSENT_BANNER_HEIGHT_VAR = '--el-consent-banner-height'

/** Marks the two answers, so a press is understood before any React arrives. */
export const CONSENT_INTENT_ATTRIBUTE = 'data-el-consent'
export const CONSENT_INTENT_ACCEPT = 'accept'
export const CONSENT_INTENT_REFUSE = 'refuse'

/** Where a press made before the deferred chunk landed waits to be applied. */
export const CONSENT_INTENT_WINDOW_KEY = '__elConsentIntent'

/**
 * THE PRE-PAINT FLAG. Runs in the head, before any body element is parsed.
 *
 * It answers exactly the question `hasDecided(decodeConsent(cookie))` answers,
 * and `tests/unit/analytics/the-consent-banner-paints-with-the-page.test.ts`
 * runs this very string against that function over a table of stored values,
 * including a malformed one, a stale version and a missing timestamp, so the
 * two cannot drift apart without the build failing.
 */
export const CONSENT_ASK_FLAG_SCRIPT = `(function(){var d=document.documentElement;var A='${CONSENT_ASK_ATTRIBUTE}';var V='${CONSENT_ASK_VALUE}';try{var n='${CONSENT_COOKIE}=';var parts=document.cookie.split('; ');var hit=null;for(var i=0;i<parts.length;i++){if(parts[i].indexOf(n)===0){hit=parts[i].slice(n.length);break}}var r=hit?JSON.parse(decodeURIComponent(hit)):null;var decided=!!r&&typeof r==='object'&&r.v===${CONSENT_VERSION}&&typeof r.t==='string';if(!decided){d.setAttribute(A,V)}}catch(e){d.setAttribute(A,V)}})();`

/**
 * THE IN-BODY BOOTSTRAP. Runs immediately after the strip is parsed and before
 * it is painted, and it does the two things the deferred React chunk is too
 * late to do.
 *
 * ONE, IT RESERVES THE STRIP'S HEIGHT AT FIRST PAINT. Measured at 390 on
 * 14 September 2026, the strip stands 286 pixels tall, /admin/login does not
 * scroll, and the Sign in button sat entirely underneath it with no way to
 * reach it. That was fixed once by measuring the element in a React effect;
 * moving the strip into the first paint would have re-opened exactly the same
 * hole for the seconds before hydration, so the measurement moved with it. The
 * ResizeObserver in `consent-banner.tsx` keeps the figure true afterwards,
 * through a rotation and through a late web font.
 *
 * TWO, IT CATCHES A PRESS MADE BEFORE THE CHUNK ARRIVES. A strip that is
 * visible and whose buttons do nothing is a dead control, which this platform
 * treats as the same defect as a dead link. The press is recorded and the strip
 * is taken down immediately, and the deferred tree applies the answer through
 * the provider the moment it mounts, so the cookie still has exactly one
 * writer.
 */
export const CONSENT_SHELL_BOOTSTRAP_SCRIPT = `(function(){var d=document.documentElement;if(d.getAttribute('${CONSENT_ASK_ATTRIBUTE}')!=='${CONSENT_ASK_VALUE}')return;var el=document.getElementById('${CONSENT_SHELL_ID}');if(!el)return;var H='${CONSENT_BANNER_HEIGHT_VAR}';d.style.setProperty(H,Math.ceil(el.getBoundingClientRect().height)+'px');el.addEventListener('click',function(ev){var t=ev.target&&ev.target.closest?ev.target.closest('[${CONSENT_INTENT_ATTRIBUTE}]'):null;if(!t)return;window['${CONSENT_INTENT_WINDOW_KEY}']=t.getAttribute('${CONSENT_INTENT_ATTRIBUTE}');d.removeAttribute('${CONSENT_ASK_ATTRIBUTE}');d.style.removeProperty(H)})})();`
