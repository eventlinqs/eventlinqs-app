import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/ui/LegalPageShell'
import { getEventFeeRates } from '@/lib/pricing/event-fee-config'

export const metadata: Metadata = {
  title: 'Refund and Ticket Policy | EventLinqs',
  description:
    'When and how EventLinqs refunds tickets, including your non-excludable rights under the Australian Consumer Law for cancelled, rescheduled, and significantly changed events.',
  alternates: { canonical: '/legal/refunds' },
}

// The fee figures below are read live from `pricing_rules`. Without this the
// page would be statically rendered once and could quote a stale rate forever.
// 60s matches the resolver's own cache TTL and the /organisers precedent.
export const revalidate = 60

const SECTIONS = [
  { id: 'summary',            title: 'Summary' },
  { id: 'consumer-rights',    title: 'Your Rights Under the ACL' },
  { id: 'cancelled',          title: 'Cancelled Events' },
  { id: 'rescheduled',        title: 'Rescheduled Events' },
  { id: 'significant-change', title: 'Significant Changes' },
  { id: 'change-of-mind',     title: 'Change of Mind' },
  { id: 'fees',               title: 'What Happens to the Fees' },
  { id: 'how-to-request',     title: 'How to Request a Refund' },
  { id: 'timeframes',         title: 'Our Response Times' },
  { id: 'ticket-terms',       title: 'Ticket Terms' },
  { id: 'chargebacks',        title: 'Chargebacks' },
  { id: 'complaints',         title: 'If You Are Not Satisfied' },
  { id: 'related',            title: 'Related Policies' },
]

export default async function RefundPolicyPage() {
  // Live fee values from `pricing_rules`, resolved through the SAME resolver the
  // charge uses, so the rate quoted in this policy can never drift from the rate
  // actually charged (Fee system law: one source, never a hardcoded number).
  const rates = await getEventFeeRates({})
  const platformLabel = `${Number(rates.platformFeePercent.toFixed(2))}% + AUD ${(
    rates.platformFeeFixedCents / 100
  ).toFixed(2)}`
  const processingLabel = `${Number(rates.processingFeePercent.toFixed(2))}%`

  return (
    <LegalPageShell
      title="Refund and Ticket Policy"
      lastUpdated="24 July 2026"
      sections={SECTIONS}
    >
      <h2 id="summary">Summary</h2>
      <p>
        This policy explains when you get your money back for a ticket bought
        through EventLinqs. It is written to sit alongside the Australian
        Consumer Law (ACL), which gives you rights that no policy, and no
        organiser, can take away.
      </p>
      <p>The short version:</p>
      <ul>
        <li>
          <strong>Event cancelled:</strong> you get a full refund of everything
          you paid, including all EventLinqs fees. You do not need to ask.
        </li>
        <li>
          <strong>Event rescheduled:</strong> you choose. Keep your ticket for
          the new date, or take a full refund including all fees.
        </li>
        <li>
          <strong>Event significantly changed:</strong> you may be entitled to a
          refund under the consumer guarantees. We assess these individually and
          resolve genuine doubt in the ticket holder&apos;s favour.
        </li>
        <li>
          <strong>You simply cannot make it:</strong> there is no automatic right
          to a refund. The organiser&apos;s own policy applies.
        </li>
      </ul>

      <h2 id="consumer-rights">Your Rights Under the Australian Consumer Law</h2>
      <p>
        Nothing in this policy, in an organiser&apos;s own terms, or in our{' '}
        <a href="/legal/terms">Terms of Service</a> excludes, restricts or
        modifies any guarantee, right or remedy you have under the ACL where it
        cannot lawfully be excluded.
      </p>
      <p>
        Selling you a ticket is the supply of a service. Under the consumer
        guarantees, that service must be supplied with due care and skill, be fit
        for its purpose, and be supplied within a reasonable time. If a failure
        to meet a consumer guarantee is <strong>major</strong>, you may choose a
        refund rather than a replacement. An event that does not happen at all is
        the clearest example of a major failure.
      </p>
      <p>
        These rights apply on top of anything an organiser has written in their
        own refund policy. Where an organiser&apos;s policy gives you less than
        the ACL requires, the ACL wins and we will apply the ACL.
      </p>

      <h2 id="cancelled">Cancelled Events</h2>
      <p>
        If an event is cancelled and not rescheduled, you are entitled to a full
        refund of the total amount you paid. That includes the ticket price and
        every EventLinqs fee shown at checkout: the platform fee and the payment
        processing fee. There is no deduction and no administration charge.
      </p>
      <p>
        You do not need to lodge a request. When an organiser confirms a
        cancellation to us, we contact affected ticket holders using the email
        address on the order and begin refunding to the original payment method.
      </p>
      <p>
        If you have heard that an event is cancelled but have not heard from us,
        please contact{' '}
        <a href="mailto:support@eventlinqs.com">support@eventlinqs.com</a> with
        your order reference so we can check the status for you.
      </p>

      <h2 id="rescheduled">Rescheduled Events</h2>
      <p>
        If an event is moved to a new date, time or venue, your ticket remains
        valid for the rescheduled event unless you tell us otherwise. We will
        contact you when the organiser confirms the new details.
      </p>
      <p>
        <strong>You may choose a full refund instead.</strong> If the new
        arrangements do not suit you, for any reason, you may request a refund of
        the total amount you paid, including all EventLinqs fees. You do not have
        to justify the decision. Please tell us within{' '}
        <strong>14 days</strong> of us notifying you of the new details, or before
        the rescheduled event begins, whichever comes first.
      </p>
      <p>
        If an event is postponed with no new date announced, you may request a
        full refund at any time before a new date is confirmed.
      </p>

      <h2 id="significant-change">Significant Changes</h2>
      <p>
        Some changes are significant enough that you did not get what you paid
        for. Depending on the circumstances, these may amount to a failure of a
        consumer guarantee and give you a right to a refund. Examples include:
      </p>
      <ul>
        <li>A change of venue that materially affects your ability to attend.</li>
        <li>
          The withdrawal of a headline act or the principal performer you bought
          the ticket to see.
        </li>
        <li>
          A fundamental change to the format, such as a seated performance
          becoming a standing one, or a substantial reduction in the programme.
        </li>
        <li>
          A change that means the seat, area or inclusions you paid for are no
          longer provided.
        </li>
      </ul>
      <p>
        Minor changes, such as a small adjustment to the running order or a
        support act change, generally do not give rise to a refund.
      </p>
      <p>
        We assess these case by case, taking into account what was advertised at
        the time you bought. Where the position is genuinely unclear, we decide in
        favour of the ticket holder.
      </p>

      <h2 id="change-of-mind">Change of Mind</h2>
      <p>
        The consumer guarantees do not cover change of mind. If the event is going
        ahead as advertised and you can no longer attend, or you have changed your
        mind, or you made a mistake in choosing the event, you do not have an
        automatic right to a refund.
      </p>
      <p>
        In those cases the organiser&apos;s own refund policy applies. Many
        organisers do offer refunds up to a cut-off date, and their policy is
        shown on the event page before you buy. If you are unsure, ask before you
        purchase.
      </p>
      <p>
        Where you bought the wrong ticket by genuine error and the event has not
        yet taken place, contact us. We cannot promise a refund, but we will raise
        it with the organiser on your behalf.
      </p>

      <h2 id="fees">What Happens to the Fees</h2>
      <p>
        EventLinqs charges a platform fee of{' '}
        <strong>{platformLabel}</strong> per paid ticket and a payment processing
        fee of <strong>{processingLabel}</strong> of the order. Free events carry
        no fees at all. The full, all-in amount is shown to you on the event page
        before you commit to buy, and again at checkout.
      </p>
      <p>
        <strong>
          Where the event is cancelled, rescheduled and you opt out, or
          significantly changed, EventLinqs refunds its fees in full along with
          the ticket price.
        </strong>{' '}
        We do not keep our fee when you did not get the event you paid for.
      </p>
      <p>
        For a discretionary change-of-mind refund agreed by the organiser, the
        EventLinqs fees may be retained, because the service of selling and
        issuing the ticket was performed. Where that applies, the amount will be
        set out before the refund is processed.
      </p>

      <h2 id="how-to-request">How to Request a Refund</h2>
      <p>
        Refunds on EventLinqs are processed by the event organiser or by
        EventLinqs. There is no self-service refund button in your account, so
        please use one of these two routes:
      </p>
      <ul>
        <li>
          <strong>Contact EventLinqs.</strong> Email{' '}
          <a href="mailto:support@eventlinqs.com">support@eventlinqs.com</a> with
          your order reference, the event name, and a short description of what
          has happened. This is the best route for a cancellation, a reschedule,
          or anything you believe involves your consumer rights.
        </li>
        <li>
          <strong>Contact the organiser.</strong> Every event page lists the
          organiser and their contact details. Organisers can issue a refund
          directly from their dashboard. This is usually the fastest route for a
          discretionary or change-of-mind request.
        </li>
      </ul>
      <p>
        You do not need to choose correctly. If you write to us about something an
        organiser should handle, we will pass it on and stay across it.
      </p>
      <p>
        Refunds are returned to the original payment method. We cannot redirect a
        refund to a different card or account.
      </p>

      <h2 id="timeframes">Our Response Times</h2>
      <p>These are the timeframes we hold ourselves to:</p>
      <ul>
        <li>
          <strong>First response:</strong> within 2 business days of receiving
          your email.
        </li>
        <li>
          <strong>Decision on a disputed refund:</strong> within 10 business days,
          or we will tell you why we need longer.
        </li>
        <li>
          <strong>Cancelled events:</strong> we begin refunding within 5 business
          days of the organiser confirming the cancellation to us.
        </li>
        <li>
          <strong>Once a refund is submitted:</strong> the funds are released to
          your bank or card issuer immediately. Card issuers typically take a
          further 5 to 10 business days to post it to your account, which is
          outside our control.
        </li>
      </ul>
      <p>
        If a refund has not reached you 10 business days after we told you it was
        processed, contact us and we will trace it with our payment processor.
      </p>

      <h2 id="ticket-terms">Ticket Terms</h2>
      <p>
        A ticket is a licence to attend a specific event on the stated date,
        subject to the organiser&apos;s conditions of entry and the venue&apos;s
        rules. It is not a transfer of ownership in anything else.
      </p>
      <ul>
        <li>
          <strong>Entry conditions.</strong> The organiser and the venue may
          refuse entry, or remove you, on reasonable grounds, including
          intoxication, unsafe behaviour, or failing to meet a stated age
          requirement. Where you are refused entry on those grounds, a refund is
          not generally payable.
        </li>
        <li>
          <strong>Age-restricted events.</strong> If an event is 18+, bring valid
          photo identification. Being unable to prove your age is not a ground for
          a refund.
        </li>
        <li>
          <strong>Transfers.</strong> Where the organiser permits it, you may
          transfer a ticket to another person through your account. The new holder
          takes on the same terms.
        </li>
        <li>
          <strong>Resale.</strong> Tickets must not be resold above the total
          amount you paid, and must not be resold for commercial gain, in line
          with Australian ticket resale laws. Tickets advertised in breach of this
          may be cancelled.
        </li>
        <li>
          <strong>Lost or duplicated tickets.</strong> Every ticket carries a
          unique code that is accepted once. If a ticket has already been scanned,
          entry may be refused.
        </li>
      </ul>

      <h2 id="chargebacks">Chargebacks</h2>
      <p>
        If something has gone wrong, please contact us before raising a chargeback
        with your bank. We can almost always resolve a genuine issue faster than
        the chargeback process, which commonly takes several weeks.
      </p>
      <p>
        Raising a chargeback does not affect your rights under the ACL, and we
        will never penalise you for exercising a legitimate right. What we ask is
        the opportunity to fix the problem first.
      </p>
      <p>
        Where we hold evidence that a chargeback is not justified, for example a
        ticket that was scanned and admitted at the event, we may contest it with
        the card network and may restrict access to the platform for repeated
        unfounded claims.
      </p>

      <h2 id="complaints">If You Are Not Satisfied</h2>
      <p>
        If you are unhappy with a refund decision, reply to us and ask for it to
        be reviewed. Escalations are read by the platform owner, not by the person
        who made the original decision.
      </p>
      <p>
        If we still cannot resolve it, you can take the matter to the consumer
        protection agency in your state or territory, or to the Australian
        Competition and Consumer Commission at{' '}
        <a
          href="https://www.accc.gov.au"
          target="_blank"
          rel="noopener noreferrer"
        >
          accc.gov.au
        </a>
        . You may also have the option of a low-cost claim through your local
        civil and administrative tribunal.
      </p>

      <h2 id="related">Related Policies</h2>
      <ul>
        <li>
          <a href="/legal/terms">Terms of Service</a>: the agreement that governs
          your use of EventLinqs.
        </li>
        <li>
          <a href="/legal/privacy">Privacy Policy</a>: what we do with your
          personal information.
        </li>
        <li>
          <a href="/legal/organiser-terms">Organiser Agreement</a>: the terms that
          bind the organisers who run events here.
        </li>
      </ul>

      <hr />

      <p>
        Questions about a refund? Email{' '}
        <a href="mailto:support@eventlinqs.com">support@eventlinqs.com</a>. We
        respond within 2 business days.
      </p>
    </LegalPageShell>
  )
}
