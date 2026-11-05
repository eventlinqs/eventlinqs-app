import { acceptedPaymentMethodsSentence } from '@/lib/payments/payment-methods'
import { PAYOUT_LINE } from '@/lib/payments/payout-line'

/**
 * /pricing's tiers and questions, pure data (moved out of src/components/templates/PricingPage.tsx so they can be
 * tested; the CONTROLLER's 08:50 (5), 5 November 2026). The paid tier's price is always the live fee at render.
 */

// ---- Pricing tier data ----

export const PRICING_TIERS = [
  {
    id: 'free',
    name: 'Free Events',
    price: 'Free forever',
    priceDetail: null,
    description:
      'Host any free event at zero cost. No platform fees. No hidden charges. Keep every dollar you collect.',
    features: [
      'Unlimited free events',
      'Unlimited free tickets',
      'Every organiser tool included',
      'Real-time sales dashboard and scan app',
      'Guest list export and check-in tools',
    ],
    cta: null,
    highlighted: false,
  },
  {
    id: 'paid',
    name: 'Paid Events',
    // Always overridden at render by the live fee (getLivePublicFee); the paid
    // tier never reads this static value. Kept blank so there is no second fee.
    price: '',
    priceDetail: 'per paid ticket sold. That is the whole fee.',
    description:
      'Transparent rates, published in full. Pass the fee to buyers or absorb it into your ticket price. Your choice.',
    // ONLY WHAT THE FEE BUYS (the CONTROLLER's 08:50 (5)): every tool is on Free; the fee pays for taking the card
    // payment, its processing (inside the one fee) and the payout.
    features: ['Card payments taken for you at checkout', 'Card processing included: no second fee', PAYOUT_LINE],
    cta: { label: 'Start selling tickets', href: '/organisers/signup' },
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    priceDetail: 'contact us for a quote',
    description:
      'For venues, festivals, and high-volume organisers. Custom rates, dedicated support, and white-label options available.',
    features: [
      'Custom pricing for high volume',
      'Dedicated account manager',
      'White-label event pages (optional)',
      'Custom integrations and reporting',
      'Priority support SLA',
    ],
    cta: { label: 'Contact us', href: '/contact?topic=partnership' },
    highlighted: false,
  },
]

// ---- FAQ data ----

export const PRICING_FAQ = [
  {
    q: "What counts as a paid ticket?",
    a: "Any ticket with a price above zero is a paid ticket. Free tickets and complimentary tickets issued by the organiser are not charged a platform fee. Free events have zero platform fees permanently.",
  },
  {
    q: "Who pays the booking fee, the organiser or the buyer?",
    a: "You choose. When you create your event, you can set whether the booking fee is absorbed into your ticket price (organiser pays) or passed on as a separate line item at checkout (buyer pays). Either way, buyers always see the full amount before confirming their purchase. No surprises.",
  },
  {
    q: "What currencies do you support?",
    a: "You can price your event in Australian dollars, British pounds, US dollars, Canadian dollars, and Euros. Buyers outside your currency will see their card issuer's exchange rate applied by their bank. EventLinqs does not add a currency conversion fee.",
  },
  {
    q: "When do I get paid after my event?",
    a: `${PAYOUT_LINE} It goes to your linked bank account. Payouts require Stripe identity verification to be completed before your first payout can be sent.`,
  },
  {
    q: "What payment methods do buyers use?",
    /*
     * COMPOSED FROM THE ONE DECLARATION, never typed (close-out SEO4 step 5).
     *
     * This answer used to be a second hand-written list, and it did not match
     * the one in the checkout panel: it named Stripe Link and the panel did not.
     * Whether Link is enabled is a Stripe dashboard fact this repository cannot
     * read, so naming it to a buyer was an unsourced claim about money. The
     * sentence is now built from src/lib/payments/payment-methods.ts, so the FAQ
     * and the checkout say the same thing by construction.
     */
    a: `Buyers can pay with ${acceptedPaymentMethodsSentence()}`,
  },
  {
    q: "Do you charge a fee for refunds?",
    a: "No. There is no refund fee and no administration charge. When a refund is issued the EventLinqs service fee goes back to the buyer with the ticket price, and for an event cancelled by the organiser the full amount paid is refunded. There is only ever the one fee, and card processing is already inside it.",
  },
]
