import type { Guide } from '../types'

/**
 * Verified against the running app 2026-07-26:
 * - Organiser refund: /dashboard/events/[id]/orders/[orderId], OrganiserRefundPanel
 *   -> RefundDialog. Per-ticket selection, six reasons (requested_by_buyer,
 *   cannot_attend, event_cancelled, duplicate, fraudulent, other), an optional
 *   buyer message and a live amount preview.
 * - Refundable ticket statuses are valid and scanned
 *   (src/components/refunds/refund-dialog.tsx REFUNDABLE_STATUSES).
 * - Amount is apportioned by face value across the whole order gross, so fees
 *   and inclusive GST come back proportionally (src/lib/payments/refund-amount.ts).
 * - Buyer transfer: /tickets -> "Transfer or gift this ticket"
 *   (src/components/features/tickets/transfer-ticket-form.tsx -> transfer_ticket RPC).
 *   A used, refunded or already transferred ticket is refused.
 */
export const refundsAndTransfers: Guide = {
  slug: 'refunds-and-transfers',
  title: 'Refunds and transfers',
  summary:
    'How to refund part or all of an order, what the buyer gets back, and how a guest passes their ticket to someone else without involving you.',
  category: 'money',
  minutes: 7,
  updated: '2026-07-26',
  keywords: [
    'refund',
    'partial refund',
    'transfer',
    'gift a ticket',
    'cancel',
    'change of name',
    'cannot attend',
    'chargeback',
    'dispute',
    'order',
  ],
  hero: {
    src: '/guides/refunds-and-transfers-1.png',
    alt: 'An order detail screen in the organiser dashboard with the refund panel open, showing selectable tickets and a reason field.',
    caption: 'The order screen. Refunds are per ticket, so a party of four can lose one person without losing the booking.',
    viewport: 1440,
  },
  related: ['getting-paid-and-payout-timing', 'running-the-door-with-the-qr-scanner', 'creating-your-first-event'],
  blocks: [
    {
      kind: 'para',
      text: 'Two different problems get solved on this page. A refund gives money back and destroys the ticket. A transfer keeps the sale and simply changes who is coming. Most of the time a guest who cannot attend wants the second one, and it costs you nothing.',
    },
    { kind: 'heading', text: 'Refunding an order, or part of one' },
    {
      kind: 'steps',
      items: [
        {
          title: 'Open the order',
          text: 'From the event dashboard, go to Orders and open the order in question. Everything you need is on that one screen.',
        },
        {
          title: 'Choose the tickets',
          text: 'Refunds are per ticket, not per order. Select only the tickets you are refunding. A group of four who lost one person keeps their other three tickets and their seats.',
        },
        {
          title: 'Pick a reason',
          text: 'Requested by buyer, buyer cannot attend, event cancelled, duplicate purchase, fraudulent, or other. The reason is recorded against the refund, which matters later when you are trying to remember why a night looked odd.',
        },
        {
          title: 'Add a message if it helps',
          text: 'An optional note to the buyer. Two lines explaining what happened prevents most follow-up emails and most card disputes.',
        },
        {
          title: 'Check the preview, then confirm',
          text: 'The dialog shows the exact amount before you commit. Confirm, and the money goes back to the original card.',
        },
      ],
    },
    {
      kind: 'note',
      title: 'What the buyer actually gets back',
      text: 'The refund is worked out from the order total apportioned across the tickets you selected, by face value. Because the total already includes fees and inclusive GST, those come back in the same proportion. Refunding half the face value of an order returns half of what the buyer paid, not half the ticket price with the fees kept.',
    },
    {
      kind: 'note',
      title: 'You can refund a ticket that has already been scanned',
      text: 'Valid and scanned tickets are both refundable. Someone who got in and then had to leave in the first ten minutes can be made whole. What cannot be refunded again is a ticket that is already refunded.',
    },
    {
      kind: 'pitfall',
      title: 'Refunds come out of held funds, so refund before your payout',
      text: 'Because the money is held until after your event, a refund before your payout simply reduces what is transferred to you and nothing else happens. A refund after you have been paid has to come from your balance instead, which is a worse experience for you. If you know a refund is coming, do it early. This is also why the settling window after your event exists.',
    },
    { kind: 'heading', text: 'Transfers: the guest does this themselves' },
    {
      kind: 'para',
      text: 'A ticket holder signs in, opens My Tickets, opens the ticket, and chooses Transfer or gift this ticket. They enter the new holder name and email. The new holder receives a fresh ticket with a new QR code, and the original code stops working immediately. You do not need to do anything, and neither does support.',
    },
    {
      kind: 'shot',
      shot: {
        src: '/guides/refunds-and-transfers-2.png',
        alt: 'The Transfer or gift this ticket form on a ticket, with fields for the new holder name and email.',
        caption: 'The buyer side. A transfer is self-serve, which is why it is the answer to most cannot-attend messages.',
        viewport: 1440,
      },
    },
    {
      kind: 'list',
      items: [
        'A ticket that has been used, refunded or already transferred cannot be transferred again, and the form says so plainly.',
        'For reserved seating the seat travels with the ticket, so the new holder gets the same seat.',
        'The name on a ticket cannot be edited any other way. Transfer is the supported path, and it is safer, because the old code dies.',
      ],
    },
    { kind: 'heading', text: 'When to reach for which' },
    {
      kind: 'list',
      items: [
        'Guest cannot come and has someone to give it to: transfer. They do it themselves in under a minute.',
        'Guest cannot come and wants their money back: refund, in line with the policy you published on the event.',
        'You cancelled the event: refund every ticket, and send a message with the reason so people are not left guessing.',
        'Someone bought twice by accident: refund the duplicate with the duplicate reason.',
        'A card dispute has been raised: contact support before refunding, so the same money is not returned twice.',
      ],
    },
    {
      kind: 'note',
      title: 'Your published policy is the promise',
      text: 'The refund policy you set on the event is shown to buyers before they pay, and you are bound by it. It is worth writing the one you will honour on a bad night, not the one that sounds generous on a good one.',
    },
  ],
}
