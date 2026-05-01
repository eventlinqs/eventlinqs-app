import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/ui/LegalPageShell'

export const metadata: Metadata = {
  title: 'Refund Policy | EventLinqs',
  description:
    'When and how EventLinqs processes ticket refunds, including event cancellations, reschedules, and Australian Consumer Law rights.',
  alternates: { canonical: '/legal/refunds' },
}

const SECTIONS = [
  { id: 'how-refunds-work',   title: 'How Refunds Work' },
  { id: 'guaranteed-refunds', title: 'When We Guarantee a Refund' },
  { id: 'service-fees',       title: 'Service Fees' },
  { id: 'refund-timeline',    title: 'How Long Refunds Take' },
  { id: 'how-to-request',     title: 'How to Request a Refund' },
  { id: 'chargebacks',        title: 'Chargebacks' },
]

export default function RefundPolicyPage() {
  return (
    <LegalPageShell
      title="Refund Policy"
      lastUpdated="15 April 2026"
      sections={SECTIONS}
    >
      <h2 id="how-refunds-work">How Refunds Work</h2>
      <p>
        EventLinqs is a platform that connects independent event organisers with
        their audiences. Each organiser sets their own refund policy, which is
        displayed on every event page before you purchase. In most cases, tickets
        are non-refundable unless the organiser has explicitly stated otherwise in
        their event terms.
      </p>
      <p>
        Before buying, we encourage you to review the organiser&apos;s refund policy
        on the event page. If it isn&apos;t clearly stated, contact the organiser
        directly or reach out to us at{' '}
        <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a> before
        completing your purchase.
      </p>

      <h2 id="guaranteed-refunds">When EventLinqs Guarantees a Refund</h2>
      <p>
        Regardless of the organiser&apos;s own refund policy, EventLinqs will
        always process a full refund in the following circumstances:
      </p>
      <ul>
        <li>
          <strong>Event cancelled.</strong> If the organiser cancels the event
          entirely, you are entitled to a full refund of everything you paid,
          including any EventLinqs service fees.
        </li>
        <li>
          <strong>Event rescheduled.</strong> If the event is moved to a new date
          and you are unable to attend the rescheduled date, you may request a
          refund. We will contact all affected ticket holders when a reschedule is
          announced and give you the option to keep your tickets or receive a refund.
        </li>
        <li>
          <strong>Material change.</strong> If the event is materially changed
          (including a significant change of venue, cancellation of the headlining
          act, or a fundamental change to the event format) you may be entitled
          to a refund under Australian Consumer Law. We assess these on a
          case-by-case basis, and we will always err on the side of the attendee
          in genuine disputes.
        </li>
      </ul>

      <h2 id="service-fees">Service Fees</h2>
      <p>
        EventLinqs service fees cover the cost of running the platform, processing
        payments, and supporting both organisers and attendees. As a general rule,
        service fees are non-refundable for change-of-mind refunds, even where the
        organiser has agreed to refund the ticket face value.
      </p>
      <p>
        <strong>Exception:</strong> If the event is cancelled by the organiser,
        EventLinqs will refund the full amount you paid, including service fees,
        without exception.
      </p>

      <h2 id="refund-timeline">How Long Refunds Take</h2>
      <p>
        Once a refund has been approved, we process it immediately. However, the
        time it takes to appear back in your account depends on your bank or card
        issuer:
      </p>
      <ul>
        <li>
          <strong>Credit and debit cards:</strong> typically 5 to 10 business days.
        </li>
        <li>
          <strong>Buy Now Pay Later services:</strong> please contact your provider
          directly, as timelines vary.
        </li>
      </ul>
      <p>
        If your refund has not appeared after 10 business days, contact us and we
        will investigate with Stripe, our payment processor.
      </p>

      <h2 id="how-to-request">How to Request a Refund</h2>
      <p>There are two ways to request a refund:</p>
      <ul>
        <li>
          <strong>Through your account.</strong> Log in, go to your tickets, find
          the relevant event, and click &ldquo;Request refund&rdquo;. You&apos;ll be guided
          through the process and can attach any supporting information.
        </li>
        <li>
          <strong>By email.</strong> Contact us at{' '}
          <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a> with
          your order reference, the event name, and a brief explanation of your
          request. We aim to respond within 24 hours on business days.
        </li>
      </ul>

      <h2 id="chargebacks">Chargebacks</h2>
      <p>
        We strongly encourage you to contact us before initiating a chargeback
        with your bank. Chargebacks take time, can be stressful, and often result
        in delays compared to resolving the issue directly with us. In most cases,
        we can process a refund faster than a chargeback would resolve.
      </p>
      <p>
        Chargebacks also have consequences for the event organiser, who may be
        penalised by Stripe even if the chargeback is later reversed. If you have
        a legitimate dispute, we want to help. Please give us the chance to do so.
      </p>
      <p>
        If you do initiate a chargeback and EventLinqs determines it is not
        justified, we reserve the right to contest it and to restrict your access
        to the platform.
      </p>

      <hr />

      <p>
        Questions about a refund?{' '}
        <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a>.
        We reply within 24 hours, Monday to Friday.
      </p>
    </LegalPageShell>
  )
}
