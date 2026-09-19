'use client'

import Script from 'next/script'
import { mayLoad } from '@/lib/analytics/consent'
import { MEASUREMENT_OFF } from '@/lib/analytics/measurement-off'
import { useConsent } from './consent-provider'

/**
 * THE ONLY PLACE A THIRD-PARTY MEASUREMENT SCRIPT IS EMITTED.
 *
 * Close-out AN1. Four providers, each behind the same two conditions, expressed
 * once in `mayLoad`: the person agreed to that category, and the owner has
 * configured that provider. Neither alone is enough, and the failure direction
 * of both is "do not load".
 *
 * WHY EACH IDENTIFIER IS READ AS A WHOLE, WRITTEN-OUT MEMBER EXPRESSION. Next
 * inlines a public environment value at build time only when it sees the
 * literal member expression in the source; a computed lookup keyed off a
 * provider's variable name inlines nothing and is `undefined` in the
 * browser. That would be a silent, total failure: every provider would look
 * unconfigured, nothing would ever load, and the platform would report that it
 * respects consent when what it actually does is nothing at all. So the four
 * names are written out here, once, and the guard holds this file and
 * src/lib/analytics/providers.ts to the same four.
 *
 * NOTHING IS EMITTED BEFORE THE COOKIE IS READ. `loading` is true for the first
 * tick and every gate is closed while it is, so the first paint of every page
 * requests nothing, for everybody, including a person who accepted last month.
 * They get their scripts one tick later.
 *
 * THE SCRIPTS ARE `afterInteractive`. Measurement never competes with the hero:
 * the mobile performance budget is a law and a tracker is not allowed to spend
 * it. A provider that will not behave on that strategy does not get added.
 */
export function GatedAnalytics() {
  const { decision, loading } = useConsent()
  // AN1's reversal condition, asked before anything else: one flag and no
  // provider is emitted at all, whatever anybody consented to and whatever is
  // configured. src/lib/analytics/measurement-off.ts.
  if (MEASUREMENT_OFF) return null
  if (loading) return null

  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
  const ga4 = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID
  const googleAds = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID
  const metaPixel = process.env.NEXT_PUBLIC_META_PIXEL_ID

  const loadPosthog = mayLoad({ decision, category: 'analytics', identifier: posthogKey })
  const loadGa4 = mayLoad({ decision, category: 'advertising', identifier: ga4 })
  const loadGoogleAds = mayLoad({ decision, category: 'advertising', identifier: googleAds })
  const loadMeta = mayLoad({ decision, category: 'advertising', identifier: metaPixel })

  // One gtag loader serves GA4 and Google Ads, because they are the same script
  // with two configured ids. Loading it twice would double every page view.
  const gtagId = loadGa4 ? ga4 : loadGoogleAds ? googleAds : null

  return (
    <>
      {loadPosthog && (
        <Script id="el-posthog" strategy="afterInteractive">
          {`!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(posthogKey)},{api_host:${JSON.stringify(posthogHost)},persistence:'localStorage+cookie',capture_pageview:true,disable_session_recording:true});`}
        </Script>
      )}

      {gtagId && (
        <>
          <Script id="el-gtag-loader" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`} />
          <Script id="el-gtag-config" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());` +
              (loadGa4 ? `gtag('config',${JSON.stringify(ga4)});` : '') +
              (loadGoogleAds ? `gtag('config',${JSON.stringify(googleAds)});` : '')}
          </Script>
        </>
      )}

      {loadMeta && (
        <Script id="el-meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(metaPixel)});fbq('track','PageView');`}
        </Script>
      )}
    </>
  )
}
