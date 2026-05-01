import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/ui/LegalPageShell'

export const metadata: Metadata = {
  title: 'Terms of Use | EventLinqs',
  description:
    'The terms and conditions that govern your use of the EventLinqs platform, including ticket purchases and organiser responsibilities.',
  alternates: { canonical: '/legal/terms' },
}

const SECTIONS = [
  { id: 'agreement',           title: 'Agreement' },
  { id: 'eligibility',         title: 'Eligibility' },
  { id: 'account-terms',       title: 'Account Terms' },
  { id: 'ticket-purchase',     title: 'Ticket Purchase Terms' },
  { id: 'organiser-terms',     title: 'Organiser Terms' },
  { id: 'acceptable-use',      title: 'Acceptable Use' },
  { id: 'payments-payouts',    title: 'Payments and Payouts' },
  { id: 'intellectual-property', title: 'Intellectual Property' },
  { id: 'platform-availability', title: 'Platform Availability' },
  { id: 'liability-limits',    title: 'Liability Limits' },
  { id: 'dispute-resolution',  title: 'Dispute Resolution' },
  { id: 'governing-law',       title: 'Governing Law' },
  { id: 'changes',             title: 'Changes to These Terms' },
  { id: 'contact-legal',       title: 'Contact' },
]

export default function TermsOfUsePage() {
  return (
    <LegalPageShell
      title="Terms of Use"
      lastUpdated="15 April 2026"
      sections={SECTIONS}
    >
      <h2 id="agreement">Agreement</h2>
      <p>
        EventLinqs is the ticketing platform built for every culture. By accessing
        or using the EventLinqs platform (including the website at{' '}
        <a href="https://eventlinqs.com">eventlinqs.com</a>, any associated mobile
        experience, or any related services), you agree to be bound by these Terms
        of Use. If you do not agree to these terms, do not use the platform.
      </p>
      <p>
        These terms form a legally binding agreement between you and EventLinqs
        (operated by Lawal Adams, trading as EventLinqs, ABN 30 837 447 587,
        Melbourne, Victoria, Australia). References to &ldquo;EventLinqs&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo; or &ldquo;our&rdquo; refer to that entity.
      </p>

      <h2 id="eligibility">Eligibility</h2>
      <p>
        You must be at least 16 years old to create an account on EventLinqs.
        If you are under 18, you represent that you have parental or guardian
        consent to use the platform and that your parent or guardian has read and
        agreed to these terms on your behalf.
      </p>
      <p>
        To create an organiser account and sell paid tickets, you must be at least
        18 years old and legally capable of entering into contracts in your
        jurisdiction. Organisers based in Australia must hold a valid ABN or be
        registered as a business entity.
      </p>

      <h2 id="account-terms">Account Terms</h2>
      <p>
        Each person may hold only one EventLinqs account. Your account is personal
        to you and may not be shared with or transferred to another person.
      </p>
      <p>
        You are responsible for providing accurate, current, and complete
        information when creating your account. Providing false information
        (including a false name, email address, or payment details) is a violation
        of these terms and may result in immediate suspension of your account.
      </p>
      <p>
        You are responsible for maintaining the confidentiality of your password
        and for all activity that occurs under your account. If you suspect
        unauthorised access, contact us immediately at{' '}
        <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a>. We are
        not liable for losses resulting from unauthorised use of your account.
      </p>
      <p>
        We reserve the right to suspend or permanently terminate your account if
        you violate these terms, engage in fraudulent activity, or behave in a
        manner that harms other users or the platform.
      </p>

      <h2 id="ticket-purchase">Ticket Purchase Terms</h2>
      <p>
        A ticket purchased through EventLinqs is a licence to attend a specific
        event, subject to the terms and conditions set by the event organiser.
        EventLinqs facilitates the sale but is not the event producer.
      </p>
      <p>
        <strong>All sales are final unless:</strong>
      </p>
      <ul>
        <li>The event is cancelled by the organiser.</li>
        <li>
          The event is rescheduled to a date you cannot attend and the organiser
          has authorised refunds for the new date.
        </li>
        <li>
          The event is materially changed (such as a change of venue, cancellation
          of the headline act, or a change of format) in circumstances covered
          by Australian Consumer Law.
        </li>
        <li>The organiser&apos;s own posted refund policy applies.</li>
      </ul>
      <p>
        EventLinqs service fees are non-refundable except where the event is
        cancelled by the organiser, in which case the full amount including service
        fees is refunded. See our{' '}
        <a href="/legal/refunds">Refund Policy</a> for full details.
      </p>
      <p>
        Tickets are issued for the named event on the stated date. EventLinqs is
        not responsible for your inability to attend due to personal circumstances,
        travel disruptions, or events outside our control.
      </p>

      <h2 id="organiser-terms">Organiser Terms</h2>
      <p>
        Event organisers using EventLinqs are independent operators. They set their
        own event details, ticket pricing, refund policy, and event terms and
        conditions. EventLinqs provides the technology platform; we are not a
        co-organiser, promoter, or partner in any event unless explicitly stated.
      </p>
      <p>
        Organisers are solely responsible for:
      </p>
      <ul>
        <li>Delivering the event as advertised: on the stated date, at the stated venue, with the stated programme.</li>
        <li>Complying with all applicable laws, including venue licensing, public liability insurance, health and safety obligations, and any permits required to run the event.</li>
        <li>Honouring their own posted refund policy.</li>
        <li>Responding promptly to attendee enquiries and complaints.</li>
      </ul>
      <p>
        By creating an event on EventLinqs, organisers warrant that all information
        provided is accurate and that they have the legal right to sell tickets for
        the event.
      </p>

      <h2 id="acceptable-use">Acceptable Use</h2>
      <p>You agree not to use EventLinqs to:</p>
      <ul>
        <li>
          <strong>Scalp or resell tickets</strong> above face value using automated
          means, bots, or mass-purchase accounts.
        </li>
        <li>
          <strong>Use bots or scrapers</strong> to access, copy, or extract data
          from the platform without our written permission.
        </li>
        <li>
          <strong>Initiate fraudulent chargebacks:</strong> that is, disputing
          a legitimate charge with your bank without first contacting us.
        </li>
        <li>
          <strong>Harass or harm other users:</strong> including organisers,
          attendees, or EventLinqs staff.
        </li>
        <li>
          <strong>List illegal events:</strong> including events that promote
          unlawful activity, violence, or discrimination.
        </li>
        <li>
          <strong>Impersonate</strong> another person or organisation, including
          EventLinqs itself.
        </li>
      </ul>
      <p>
        Violations of this section may result in immediate account suspension and,
        where appropriate, referral to law enforcement.
      </p>

      <h2 id="payments-payouts">Payments and Payouts</h2>
      <p>
        All payments on EventLinqs are processed by Stripe. By purchasing a ticket
        or accepting payments as an organiser, you agree to{' '}
        <a
          href="https://stripe.com/au/legal"
          target="_blank"
          rel="noopener noreferrer"
        >
          Stripe&apos;s Terms of Service
        </a>
        .
      </p>
      <p>
        <strong>For organisers:</strong> Payouts of ticket revenue (less
        EventLinqs service fees) are processed within 7 business days following
        the event date. Payouts are subject to Stripe&apos;s identity verification
        requirements. If a chargeback is successfully raised against a sale, the
        disputed amount is deducted from the organiser&apos;s payout balance.
      </p>
      <p>
        EventLinqs reserves the right to withhold payouts where there is a
        reasonable suspicion of fraud, a high rate of disputes, or a material
        breach of organiser obligations.
      </p>

      <h2 id="intellectual-property">Intellectual Property</h2>
      <p>
        The EventLinqs platform (including its design, code, branding, and
        copy) is owned by EventLinqs and protected by Australian and international
        intellectual property law. You may not copy, reproduce, or redistribute
        any part of the platform without our written permission.
      </p>
      <p>
        Content you upload to EventLinqs (including event descriptions, images,
        and videos) remains your property. By uploading it, you grant EventLinqs
        a non-exclusive, royalty-free, worldwide licence to display that content
        on the platform and in promotional materials related to your event. This
        licence ends when you remove the content or close your account, except
        where the content has already been included in published promotional materials.
      </p>

      <h2 id="platform-availability">Platform Availability</h2>
      <p>
        We aim for 99.9% uptime and work hard to keep EventLinqs fast and reliable.
        Scheduled maintenance is announced via our status page and, where possible,
        scheduled outside peak hours.
      </p>
      <p>
        We are not liable for service interruptions caused by events beyond our
        reasonable control, including but not limited to natural disasters,
        government action, infrastructure failures at third-party providers, or
        widespread internet outages (force majeure events).
      </p>

      <h2 id="liability-limits">Liability Limits</h2>
      <p>
        EventLinqs is a technology platform that connects organisers and attendees.
        We are not the event organiser, venue operator, or producer of any event
        listed on the platform. We are not liable for:
      </p>
      <ul>
        <li>The quality, safety, or delivery of any event.</li>
        <li>Injury or loss suffered at or in connection with an event.</li>
        <li>Conduct of event organisers, venues, or other attendees.</li>
        <li>Events cancelled, rescheduled, or materially changed by the organiser.</li>
      </ul>
      <p>
        To the maximum extent permitted by Australian law, EventLinqs&apos; total
        liability to you in respect of any claim arising from your use of the platform
        is capped at the total amount of service fees you paid to EventLinqs in the
        12 months preceding the claim.
      </p>
      <p>
        Nothing in these terms excludes liability that cannot be excluded under
        Australian Consumer Law, including guarantees relating to services.
      </p>

      <h2 id="dispute-resolution">Dispute Resolution</h2>
      <p>
        If you have a dispute with EventLinqs, please contact us first at{' '}
        <a href="mailto:legal@eventlinqs.com">legal@eventlinqs.com</a>. We will
        make a genuine effort to resolve the matter directly and quickly.
      </p>
      <p>
        If we cannot resolve the dispute directly within 30 days, either party may
        refer the matter to mediation through the Resolution Institute (Australia).
        If mediation is unsuccessful, the dispute will be resolved by the courts
        of Victoria, Australia.
      </p>

      <h2 id="governing-law">Governing Law</h2>
      <p>
        These terms are governed by the laws of Victoria, Australia. You submit
        to the non-exclusive jurisdiction of the courts of Victoria for the
        resolution of any dispute arising from these terms or your use of the
        platform.
      </p>

      <h2 id="changes">Changes to These Terms</h2>
      <p>
        We may update these terms from time to time. When we make material changes,
        we will notify you by email at least 30 days before the changes take effect.
        Your continued use of EventLinqs after the effective date constitutes
        acceptance of the updated terms.
      </p>
      <p>
        We will always keep the current version of these terms available at{' '}
        <a href="/legal/terms">eventlinqs.com/legal/terms</a>.
      </p>

      <h2 id="contact-legal">Contact</h2>
      <p>
        For legal enquiries, please contact:{' '}
        <a href="mailto:legal@eventlinqs.com">legal@eventlinqs.com</a>
      </p>
      <p>
        For general support:{' '}
        <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a>
      </p>
    </LegalPageShell>
  )
}
