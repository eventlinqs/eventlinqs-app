'use client'

import { ReferralCapture } from '@/components/growth/referral-capture'
import { ArrivalCapture } from '@/components/growth/arrival-capture'
import { ClickIdentifierRelay } from '@/components/growth/click-identifier-relay'
import { ConsentProvider } from './consent-provider'
import { ConsentBanner } from './consent-banner'
import { GatedAnalytics } from './gated-analytics'
import { FunnelLanded } from './funnel-landed'

/**
 * EVERYTHING THE ROOT LAYOUT MOUNTS FOR MEASUREMENT AND ATTRIBUTION, IN ONE
 * TREE, SO IT CAN BE FETCHED AS ONE CHUNK.
 *
 * This is the exact tree that stood inline in `src/app/layout.tsx`, in the
 * exact order, with the exact nesting. It was moved here and nothing about it
 * was rewritten: the provider still wraps the three consumers, and the two
 * attribution captures are still its siblings rather than its children,
 * because they answer different questions and are read by different code at
 * different moments (close-out AN1 and GA3, and the comments those components
 * carry).
 *
 * `measurement-boot.tsx` is the only importer, and it imports this file
 * lazily. See that file for why.
 *
 * THE CONSENT CONTEXT DOES NOT LEAVE THIS TREE, AND THAT IS WHAT MAKES THE
 * MOVE SAFE. `useConsent` has exactly three consumers on the platform -
 * `gated-analytics.tsx`, `funnel-landed.tsx` and `consent-banner.tsx` - and
 * all three are below. Nothing outside this file reads the context, so
 * deferring the provider cannot leave a consumer without one. If a fourth
 * consumer is ever added ANYWHERE ELSE, it must be added inside this tree or
 * the provider must move back up, and `tests/unit/analytics/consent-context-
 * stays-in-the-deferred-tree.test.ts` fails the build until one of those two
 * things is true.
 */
export default function MeasurementStack() {
  return (
    <>
      {/* First-touch attribution capture (acquisition loop). Renders null and
       *  runs only in a post-paint effect, so it never costs LCP. It sat in the
       *  layout until 18 September 2026 and moved here for the same reason as
       *  the rest of this tree: it is the arrival capture's twin, it renders
       *  nothing, and there was no reason for its bytes to be in the first load
       *  of every route. */}
      <ReferralCapture />
      {/* HOW THIS ACCOUNT ARRIVED (close-out AN1). A sibling of the referral
       *  capture above rather than part of it: that one answers "who
       *  referred this person", this one answers "which surface brought them",
       *  and they are read by different code at different moments. Renders
       *  null, post-paint, nothing identifying. */}
      <ArrivalCapture />
      {/* THE CLICK IDENTIFIER, CARRIED OUT OF THE ADDRESS (close-out GA3).
       *  Rung 2 of the attribution ladder: the person who was sent the address
       *  rather than the person who opened the tracked link. Beside the arrival
       *  capture rather than inside it, because that one is first touch and
       *  answers which surface brought an account, and this one is last touch
       *  and answers which message produced a sale. Renders null, post-paint,
       *  one session cookie or none. */}
      <ClickIdentifierRelay />
      {/* MEASUREMENT, AND THE ONLY WAY IT LOADS (close-out AN1). The provider
       *  holds the decision, the banner takes it, and the gate emits a
       *  third-party script only when the person agreed AND the owner
       *  configured that provider. Nothing here renders anything visible until
       *  a visitor who has never answered arrives, and nothing here requests
       *  anything at all before that. Plausible, in the layout, is outside this
       *  gate on purpose: it is cookieless and stores nothing on the device
       *  (see lib/analytics/providers.ts). */}
      <ConsentProvider>
        <GatedAnalytics />
        <FunnelLanded />
        <ConsentBanner />
      </ConsentProvider>
    </>
  )
}
