import type { Guide } from '../types'

/**
 * Verified against the running app 2026-07-26:
 * - Funds-holding model: docs/PAYMENTS-FUNDS-HOLDING.md. EventLinqs holds the
 *   funds and pays the organiser after the event by platform -> connected
 *   Stripe Transfer (src/lib/payments/event-transfer.ts).
 * - The wait after the event is the founder-settable AU/AUD
 *   payout_schedule_days rule, read through the ONE pricing resolver
 *   (getPayoutScheduleDays, src/lib/payments/pricing-rules.ts) and rendered
 *   here as the live {{payoutDays}} token, never a hardcoded number.
 * - Reserve holds mature at event end plus N BUSINESS days
 *   (src/lib/payments/connect-ledger.ts computeReleaseAt / addBusinessDays).
 * - Disbursement is skipped while payouts are inactive or a chargeback hold
 *   is open, and is idempotent (disburse_transfer claims under a row lock).
 * - The fee label is the live value from the same resolver, per the Fee
 *   system law: {{fee}}, never a hardcoded fee number.
 */
export const gettingPaidAndPayoutTiming: Guide = {
  slug: 'getting-paid-and-payout-timing',
  title: 'Getting paid and payout timing',
  summary:
    'Where the money sits between the sale and your bank account, what is taken out, and exactly when it moves.',
  category: 'money',
  minutes: 8,
  updated: '2026-07-26',
  keywords: [
    'payout',
    'get paid',
    'payment',
    'stripe',
    'connect',
    'bank account',
    'fees',
    'platform fee',
    'timing',
    'when do I get paid',
    'reserve',
    'balance',
  ],
  hero: {
    src: '/guides/getting-paid-and-payout-timing-1.png',
    alt: 'The Payouts screen in the organiser dashboard showing the connected payout account and balance.',
    caption: 'Payouts in the dashboard. Connect once, then this is where you watch the money move.',
    viewport: 1440,
  },
  related: ['refunds-and-transfers', 'creating-your-first-event', 'tracking-your-reach'],
  blocks: [
    {
      kind: 'para',
      text: 'Here is the whole model in one paragraph. When someone buys a ticket, the money is collected and held, not sent straight to you. After your event has finished and a short settling window has passed, the amount owed to you is transferred to your connected payout account, and from there it lands in your bank on your own bank schedule. Holding the funds is what lets a refund actually work without chasing you for money back.',
    },
    { kind: 'heading', text: 'Connect your payout account once' },
    {
      kind: 'para',
      text: 'Open Payouts from the dashboard. You will be taken through the Stripe identity check: your business or sole trader details, and the bank account the money should reach. It is the same verification every legitimate payments provider is legally required to do, and it only happens once for your organisation.',
    },
    {
      kind: 'list',
      items: [
        'Free events do not need a connected account. You can publish and run them without ever touching this screen.',
        'A paid event cannot publish until the account is connected, verified and unrestricted, because otherwise there is nowhere for the money to go.',
        'If Stripe asks for another document later, the Payouts screen tells you exactly what is outstanding.',
      ],
    },
    { kind: 'heading', text: 'What is taken out' },
    {
      kind: 'para',
      text: 'One fee applies to each paid ticket, currently {{fee}}, shown live from the platform pricing engine rather than typed into this page. Card processing is inside that fee: there is no separate processing charge and no second fee. Free tickets carry no fees at all, permanently.',
    },
    {
      kind: 'para',
      text: 'You choose per event whether that fee is passed on to the buyer or absorbed by you. Pass on is the default: the buyer pays the fee on top and you keep the full face value of the ticket. Absorb takes the fee out of your payout instead, so the buyer pays exactly the sticker price. Either way the buyer sees the true all-in total before they reach checkout, which is required in Australia and is a good idea regardless.',
    },
    { kind: 'heading', text: 'When the money moves' },
    {
      kind: 'steps',
      items: [
        {
          title: 'While the event is selling',
          text: 'Funds accumulate against your event. Nothing is transferred yet. You can watch the balance build on the Payouts screen.',
        },
        {
          title: 'Your event ends',
          text: 'The clock starts at your event end time, which is the one you set in the event form. This is why a wrong end time delays a payout.',
        },
        {
          title: 'The settling window passes',
          text: 'Your funds are released {{payoutDays}} days after the event ends. That window absorbs late refunds and card disputes so money is not sent out and then clawed back.',
        },
        {
          title: 'The transfer runs',
          text: 'An automatic job runs regularly and moves the released amount to your connected account. It is safe to run repeatedly: once an event is paid, it is not paid twice.',
        },
        {
          title: 'Your bank pays out',
          text: 'From your connected account, the money follows your own bank payout schedule, which typically adds a small number of business days depending on your bank.',
        },
      ],
    },
    {
      kind: 'shot',
      shot: {
        src: '/guides/getting-paid-and-payout-timing-2.png',
        alt: 'The payout account connection card in the dashboard showing the verification state.',
        caption: 'Connect once per organisation. This card tells you exactly what Stripe still wants, if anything.',
        viewport: 1440,
      },
    },
    {
      kind: 'note',
      title: 'A reserve may hold back part of it for a little longer',
      text: 'Part of your balance can be held as a reserve against refunds and disputes, and that reserve matures on business days after your event, so a weekend does not count toward it. When it matures it is picked up on the next run and paid without you doing anything. You will see it as a held amount rather than as missing money.',
    },
    {
      kind: 'pitfall',
      title: 'Three things that quietly hold a payout',
      text: 'An event end time set later than the event actually finished, because the clock starts there. A payout account that has gone restricted, usually because Stripe asked for a document and nobody opened the email. An open card dispute on the event, which holds the disbursement until it resolves rather than paying out money that may have to come back. All three are visible on the Payouts screen, and all three are worth checking before you contact support.',
    },
    {
      kind: 'note',
      title: 'GST',
      text: 'You are the seller of the ticket, so GST on the ticket price is yours to handle. EventLinqs deals with GST only on its own fee. Nothing extra is added to the buyer total for it.',
    },
  ],
}
