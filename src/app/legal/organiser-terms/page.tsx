import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/ui/LegalPageShell'
import { getEventFeeRates } from '@/lib/pricing/event-fee-config'

export const metadata: Metadata = {
  title: 'Organiser Agreement | EventLinqs',
  description:
    'The agreement for organisers selling tickets on EventLinqs: fees, the payout schedule and reserve, chargeback liability, cancellation obligations, attendee data ownership, and prohibited events.',
  alternates: { canonical: '/legal/organiser-terms' },
}

// The fee figures below are read live from `pricing_rules`. Without this the
// page would be statically rendered once and could quote a stale rate forever.
// 60s matches the resolver's own cache TTL and the /organisers precedent.
export const revalidate = 60

const SECTIONS = [
  { id: 'about',          title: 'About This Agreement' },
  { id: 'roles',          title: 'Our Role and Yours' },
  { id: 'eligibility',    title: 'Eligibility and Verification' },
  { id: 'listings',       title: 'Your Listings' },
  { id: 'fees',           title: 'Fees' },
  { id: 'founding',       title: 'Founding Organiser Offer' },
  { id: 'rate-changes',   title: 'Rate Changes' },
  { id: 'payouts',        title: 'Payouts and the Reserve' },
  { id: 'refund-duties',  title: 'Refunds' },
  { id: 'chargebacks',    title: 'Chargeback Liability' },
  { id: 'cancellation',   title: 'Cancelling or Rescheduling' },
  { id: 'attendee-duties',title: 'Duties to Attendees' },
  { id: 'attendee-data',  title: 'Attendee Data' },
  { id: 'prohibited',     title: 'Prohibited Events and Conduct' },
  { id: 'compliance',     title: 'Insurance, Licences and Tax' },
  { id: 'suspension',     title: 'Suspension and Termination' },
  { id: 'liability',      title: 'Liability and Indemnity' },
  { id: 'changes',        title: 'Changes to This Agreement' },
  { id: 'contact',        title: 'Contact' },
  { id: 'related',        title: 'Related Policies' },
]

export default async function OrganiserAgreementPage() {
  // Live fee values from `pricing_rules`, resolved through the SAME resolver the
  // charge and payout use, so the rates in this agreement can never drift from
  // the rates actually applied (Fee system law: one source, never hardcoded).
  const rates = await getEventFeeRates({})
  const platformPercent = `${Number(rates.platformFeePercent.toFixed(2))}%`
  const platformFixed = `AUD ${(rates.platformFeeFixedCents / 100).toFixed(2)}`
  // ONE FEE, 15 August 2026. Card processing is included in the single fee.

  return (
    <LegalPageShell
      title="Organiser Agreement"
      lastUpdated="24 July 2026"
      sections={SECTIONS}
    >
      <h2 id="about">About This Agreement</h2>
      <p>
        This agreement applies whenever you use EventLinqs to list an event, sell
        tickets, or manage attendees. It sits on top of our{' '}
        <a href="/legal/terms">Terms of Service</a>, and where the two conflict on
        an organiser matter, this agreement applies.
      </p>
      <p>
        It is a binding agreement between you (the organiser) and Lawal Adams,
        trading as EventLinqs, ABN 30 837 447 587, PO Box 141, Newcomb VIC 3219,
        Australia. By publishing an event you accept it.
      </p>
      <p>
        We have written it in plain language on purpose. If anything here is
        unclear, ask us at{' '}
        <a href="mailto:organisers@eventlinqs.com">organisers@eventlinqs.com</a>{' '}
        before you publish.
      </p>

      <h2 id="roles">Our Role and Yours</h2>
      <p>
        <strong>You are the seller of the ticket and the provider of the
        event.</strong> You set the event, the price, the inclusions, the
        conditions of entry, and your own refund policy. You carry the legal
        responsibility for delivering what you advertised.
      </p>
      <p>
        <strong>EventLinqs is your ticketing platform and your limited payment
        collection agent.</strong> We provide the technology, and we collect ticket
        money from buyers on your behalf. Payment by a buyer to us discharges that
        buyer&apos;s obligation to pay you. We hold the funds and pay them to you
        under the payout terms below.
      </p>
      <p>
        We are not a co-promoter, partner, producer, or venue operator for your
        event, and we do not take on your obligations to attendees, performers,
        venues or suppliers.
      </p>

      <h2 id="eligibility">Eligibility and Verification</h2>
      <p>To sell paid tickets you must:</p>
      <ul>
        <li>Be at least 18 and legally able to enter contracts.</li>
        <li>
          Hold a valid ABN or equivalent business registration if you are based in
          Australia.
        </li>
        <li>
          Provide accurate business, contact and bank account details, and keep
          them current.
        </li>
        <li>
          Complete identity and business verification through Stripe Connect,
          which collects and verifies your identity and bank details directly.
          EventLinqs does not store your identity documents.
        </li>
      </ul>
      <p>
        Payouts remain on hold until Stripe reports your connected account as
        verified and payouts-enabled. We may pause payouts if Stripe later requires
        further information from you.
      </p>
      <p>Free events may be listed by any verified account.</p>

      <h2 id="listings">Your Listings</h2>
      <p>
        You are responsible for everything in your listing being accurate and not
        misleading, including the date, time, venue, line-up, inclusions, age
        restrictions, accessibility information, and your refund policy. Misleading
        or deceptive conduct is unlawful under the Australian Consumer Law, and a
        listing is a representation to consumers.
      </p>
      <p>
        You confirm that you hold the rights to everything you upload, including
        images, artwork, logos, music and performer likenesses, and that you have
        the right to sell tickets to the event.
      </p>
      <p>
        You keep ownership of your content and grant us the licence described in
        the <a href="/legal/terms">Terms of Service</a> so we can display and
        promote your event. We may remove or unpublish a listing that breaches this
        agreement, is unlawful, or exposes us or attendees to risk.
      </p>

      <h2 id="fees">Fees</h2>
      <p>One fee applies to each paid ticket sold through EventLinqs:</p>
      <ul>
        <li>
          <strong>EventLinqs fee:</strong> {platformPercent} of the ticket price plus{' '}
          {platformFixed} per ticket. Card processing is included in this fee and
          is not charged separately.
        </li>
      </ul>
      <p>
        <strong>Free events carry no fees at all.</strong> If the order total is
        zero, no fee is calculated and nothing is charged.
      </p>
      <p>
        These figures are read live from our pricing system, which is the same
        single source that calculates what a buyer is charged and what you are paid.
        The rate published here is therefore always the rate applied.
      </p>
      <p>
        <strong>Who pays the fees.</strong> You choose per event. Under{' '}
        <strong>pass-on</strong> (the default), the buyer pays the fees on top of
        the ticket price and you keep the full face value. Under{' '}
        <strong>absorb</strong>, the buyer pays only the ticket price and the fees
        are deducted from your payout. The buyer always sees the true all-in total
        before committing to buy.
      </p>
      <p>
        <strong>GST.</strong> You are the seller, so you are responsible for any GST
        on the ticket price and for your own tax reporting. EventLinqs deals with
        GST only on its own fees, and only once registered for GST. Ticket prices
        and fees are treated as GST-inclusive, and no separate GST line is added to
        the buyer total.
      </p>

      <h2 id="founding">Founding Organiser Offer</h2>
      <p>
        The Founding Organiser offer is available to the{' '}
        <strong>first 50 organisers across Geelong and Melbourne</strong>. If you
        are accepted into it:
      </p>
      <ul>
        <li>
          You pay <strong>zero platform fees for 6 months</strong> from the date we
          confirm your place.
        </li>
        <li>
          The fee-free period extends by a further <strong>3 months</strong> for
          each organiser you successfully refer who publishes and sells a paid
          event.
        </li>
        <li>
          In return we ask for your honest feedback on the platform as we build it.
        </li>
      </ul>
      <p>
        <strong>The fee-free period means no EventLinqs fee at all.</strong> There
        is one fee and it is waived in full during the period, so a $20 ticket is
        $20 all in. Card processing is included in our fee, so nothing is charged
        separately in its place.
      </p>
      <p>
        The offer is capped and closes once 50 places are taken. Places are
        confirmed by us in writing. We may withdraw a place where an organiser
        breaches this agreement. At the end of your fee-free period, the standard
        published rates apply, and we will tell you before that happens.
      </p>

      <h2 id="rate-changes">Rate Changes</h2>
      <p>
        <strong>Your rate never changes retroactively.</strong> Tickets already sold
        keep the fee that applied when they were sold. A rate change never reaches
        back into completed orders.
      </p>
      <p>
        <strong>A promotional rate is held for its stated term.</strong> If you are
        on a promotional, founding or negotiated rate, that rate applies for the
        full term we agreed with you, including any extensions you have earned. We
        will not shorten it or raise it during that term.
      </p>
      <p>
        For standard rates, we will give you at least <strong>30 days notice</strong>{' '}
        by email before a change takes effect. Events already on sale when the
        notice period ends keep the previous rate until they finish. If you do not
        accept a new rate, you may stop listing new events and we will pay out your
        existing events under the old rate.
      </p>

      <h2 id="payouts">Payouts and the Reserve</h2>
      <p>
        EventLinqs holds ticket funds and pays you after your event. This protects
        attendees, and it is what lets us guarantee refunds on cancellation.
      </p>
      <p>
        <strong>The payout schedule.</strong> Your payout is released{' '}
        <strong>3 business days after your event ends</strong>. Business days
        exclude weekends. The payout is the ticket revenue less the fees above, less
        any refunds, chargebacks and adjustments on that event.
      </p>
      <p>
        <strong>The reserve.</strong> We hold a reserve of{' '}
        <strong>20% of your net share</strong> of each order, to cover refunds and
        chargebacks that arrive after the event.
      </p>
      <ul>
        <li>
          The reserve is released at the <strong>same point</strong> as the rest of
          your payout, 3 business days after the event ends, so in the normal case
          you receive 100% of what you are owed in one release.
        </li>
        <li>
          The reserve is <strong>only</strong> held back beyond that point where
          there is an <strong>open dispute on that event</strong>. If a chargeback
          is open, the reserve stays held until it is resolved, and is then released
          or applied to the outcome.
        </li>
        <li>
          Refunds are taken from the reserve first, then from your available
          balance.
        </li>
      </ul>
      <p>
        <strong>When we may hold funds longer.</strong> We may extend a hold, raise
        a reserve, or pause a payout where we reasonably suspect fraud, where your
        dispute rate is materially above normal, where you are in material breach of
        this agreement, where Stripe requires further verification, or where the law
        requires it. We will tell you why, and release the funds as soon as the
        reason no longer applies.
      </p>
      <p>
        Payouts go to the verified bank account on your Stripe connected account. We
        cannot pay to a third party. Your current balance, reserve, and release
        dates are visible in your organiser dashboard.
      </p>

      <h2 id="refund-duties">Refunds</h2>
      <p>
        Our <a href="/legal/refunds">Refund and Ticket Policy</a> sets out when a
        buyer is entitled to a refund. You must honour it, and you must honour your
        own published policy where it is more generous.
      </p>
      <p>
        <strong>How refunds happen.</strong> You can issue a refund yourself from
        the order screen in your dashboard. EventLinqs can also issue one, and will
        do so where the Refund and Ticket Policy or the Australian Consumer Law
        requires it, including where you have not acted within a reasonable time.
        Buyers do not have a self-service refund button, so refund requests reach
        you or us by email.
      </p>
      <p>
        <strong>Who bears the cost.</strong> When an order is refunded, the refund
        is taken from your reserve and balance for that event, up to the amount you
        received. Under the fee arrangement currently operating, the EventLinqs
        fee portion of a refunded order is borne by EventLinqs and is not
        deducted from you in addition to your share.
      </p>
      <p>
        <strong>We reserve the right to recover fees.</strong> Where an event is
        cancelled, abandoned, or materially misrepresented by you, and EventLinqs
        refunds buyers their fees as a result, we may recover the cost of those fees
        from your payout, your reserve, or as a debt. We will itemise any such
        recovery before applying it.
      </p>
      <p>
        If refunds exceed the funds we hold for you, the shortfall is a debt payable
        by you to EventLinqs, and we may offset it against payouts on your other
        events.
      </p>

      <h2 id="chargebacks">Chargeback Liability</h2>
      <p>
        A chargeback happens when a buyer disputes a payment with their bank. The
        card network decides the outcome, not EventLinqs and not the buyer.
      </p>
      <ul>
        <li>
          <strong>You carry the liability</strong> for chargebacks on your events.
          When a dispute is opened, the disputed amount is debited from your balance
          for that event and a hold is placed on it.
        </li>
        <li>
          <strong>Payouts pause on a disputed event.</strong> While a dispute is
          open on an event, the reserve for that event is not released.
        </li>
        <li>
          <strong>We will help you fight it.</strong> We assemble the evidence we
          hold, including the order record, the ticket, and whether it was scanned at
          the door, and we submit the response. You must give us any additional
          evidence promptly when we ask.
        </li>
        <li>
          <strong>If the dispute is resolved in your favour</strong>, the amount is
          returned to your balance and released.
        </li>
        <li>
          <strong>If it is lost</strong>, the amount stays deducted. Any fee the card
          network charges for the dispute may also be passed on to you.
        </li>
        <li>
          <strong>Sustained high dispute rates</strong> put your account at risk. We
          may raise your reserve, extend your hold period, suspend ticket sales, or
          close your account.
        </li>
      </ul>
      <p>
        If your balance is insufficient to cover a lost chargeback, the amount is a
        debt payable by you, and we may recover it from payouts on your other
        events.
      </p>

      <h2 id="cancellation">Cancelling or Rescheduling</h2>
      <p>
        Cancelling an event is serious for the people who bought tickets. If you
        must cancel or reschedule, these obligations apply.
      </p>
      <ul>
        <li>
          <strong>Tell us immediately</strong> at{' '}
          <a href="mailto:organisers@eventlinqs.com">organisers@eventlinqs.com</a>,
          and in any event within <strong>24 hours</strong> of the decision. Do not
          announce a cancellation to attendees before telling us, so that refund
          messaging is accurate.
        </li>
        <li>
          <strong>Cancelled events are refunded in full,</strong> including all
          EventLinqs fees, to every ticket holder. You authorise us to process those
          refunds without needing your further approval, and to apply them against
          your reserve, your balance, and your future payouts.
        </li>
        <li>
          <strong>Rescheduled events:</strong> every ticket holder must be offered
          the choice of keeping their ticket for the new date or taking a full
          refund. You cannot force a credit or a transfer on an attendee.
        </li>
        <li>
          <strong>Significant changes</strong> to venue, line-up or format may
          trigger refund rights under the Australian Consumer Law. Tell us before
          you make the change so we can advise ticket holders correctly.
        </li>
        <li>
          <strong>If funds have already been paid to you</strong> and an event is
          later cancelled, you must return the amount needed to refund attendees
          within <strong>7 days</strong> of our request. This is a debt payable to
          EventLinqs.
        </li>
        <li>
          <strong>You remain responsible</strong> for your own communications with
          attendees, and for any obligations you have to performers, venues and
          suppliers.
        </li>
      </ul>
      <p>
        Repeatedly cancelling events, or cancelling after taking payment with no
        intention of delivering, is a serious breach and may be reported to
        regulators or the police.
      </p>

      <h2 id="attendee-duties">Duties to Attendees</h2>
      <p>You must:</p>
      <ul>
        <li>
          Deliver the event as advertised, on the stated date, at the stated venue,
          with the stated programme.
        </li>
        <li>
          Provide safe conditions of entry and comply with the venue&apos;s rules and
          capacity limits.
        </li>
        <li>
          Publish clear, lawful conditions of entry, age restrictions, and
          accessibility information before tickets go on sale.
        </li>
        <li>
          Respond to attendee enquiries and complaints promptly, and within{' '}
          <strong>2 business days</strong>.
        </li>
        <li>
          Honour your published refund policy, and the{' '}
          <a href="/legal/refunds">Refund and Ticket Policy</a> where it gives the
          attendee more.
        </li>
        <li>
          Not discriminate against attendees on any ground protected by Australian
          anti-discrimination law.
        </li>
      </ul>

      <h2 id="attendee-data">Attendee Data</h2>
      <p>
        <strong>You own your attendee relationships.</strong> We do not wall you off
        from the people who buy your tickets. You can see and export your attendee
        list, including names and email addresses, from your dashboard at any time,
        and you keep that data if you leave.
      </p>
      <p>That ownership carries obligations. You must:</p>
      <ul>
        <li>
          Comply with the Privacy Act 1988 (Cth) and the Australian Privacy
          Principles in respect of attendee information, whether or not the Act
          otherwise applies to your organisation.
        </li>
        <li>
          Use attendee information only to run your event and for your own
          legitimate purposes as the organiser.
        </li>
        <li>
          <strong>Never sell, rent or trade attendee information</strong> to a third
          party.
        </li>
        <li>
          Only send marketing to attendees who consented to hear from you at
          checkout. Consent given to EventLinqs is not consent to hear from you. The
          export marks who opted in.
        </li>
        <li>
          Comply with the Spam Act 2003 (Cth): identify yourself, and include a
          working unsubscribe in every marketing message.
        </li>
        <li>
          Keep the data secure, and handle access, correction and deletion requests
          that attendees make to you.
        </li>
        <li>
          Tell us promptly if attendee data you hold is involved in a data breach,
          so we can meet our own notification obligations.
        </li>
      </ul>
      <p>
        We may suspend access to attendee exports where we have reasonable grounds
        to believe data is being misused.
      </p>

      <h2 id="prohibited">Prohibited Events and Conduct</h2>
      <p>You must not list, promote or sell tickets to:</p>
      <ul>
        <li>
          Events that are unlawful, or that promote or facilitate unlawful activity.
        </li>
        <li>
          Events promoting violence, terrorism, or serious harm, or that vilify or
          incite hatred against a person or group on the basis of race, religion,
          ethnicity, nationality, disability, sex, gender identity or sexual
          orientation.
        </li>
        <li>
          Events involving unlicensed gambling, or prize promotions run without the
          permits your state or territory requires.
        </li>
        <li>
          Events involving the sale or supply of illicit drugs, or alcohol supplied
          without the required licence.
        </li>
        <li>
          Sexually explicit events or adult services that are unlawful or not
          lawfully permitted at the venue.
        </li>
        <li>
          Events involving weapons, explosives, or other regulated goods without the
          required authorisation.
        </li>
        <li>
          Events involving cruelty to animals, or the sale of protected wildlife.
        </li>
        <li>
          Events promoting pyramid schemes, referral selling schemes, unlicensed
          financial products, or investment schemes that breach financial services
          law.
        </li>
        <li>
          Events infringing another person&apos;s intellectual property, including
          unlicensed tribute performances presented as official, or unauthorised
          screenings.
        </li>
        <li>
          Events you do not have the right to run, including selling tickets to an
          event organised by someone else, and speculative listings for events not
          confirmed.
        </li>
        <li>
          Events designed to launder money, evade tax, or evade sanctions.
        </li>
        <li>
          Events endangering children, or failing to meet working-with-children
          requirements where they apply.
        </li>
      </ul>
      <p>You must also not:</p>
      <ul>
        <li>
          Advertise a ticket price that is not achievable, or hide compulsory
          charges, which is drip pricing and unlawful under the Australian Consumer
          Law.
        </li>
        <li>
          Create false urgency or scarcity, or publish fake sales, fake reviews or
          fake attendance figures.
        </li>
        <li>
          Buy tickets to your own event to manufacture demand, or use the platform
          to test or launder card details.
        </li>
        <li>
          Move buyers off-platform to avoid fees after they have discovered your
          event here.
        </li>
        <li>
          Misuse the EventLinqs name or branding, or imply we endorse or co-produce
          your event.
        </li>
      </ul>
      <p>
        We may unpublish an event, suspend sales, withhold funds, or close an
        account for a breach of this section, and we may report serious matters to
        the police or a regulator.
      </p>

      <h2 id="compliance">Insurance, Licences and Tax</h2>
      <p>
        You are responsible for obtaining and maintaining everything your event
        legally requires, including public liability insurance appropriate to the
        event and venue, venue and liquor licensing, council permits, food handling
        approvals, noise and crowd management compliance, and work health and safety
        obligations.
      </p>
      <p>
        You are responsible for your own tax affairs, including GST, income tax, and
        any withholding. We do not provide tax advice, and we do not remit tax on
        the ticket price on your behalf.
      </p>
      <p>We may ask you to evidence any of the above, and to pause sales until you do.</p>

      <h2 id="suspension">Suspension and Termination</h2>
      <p>
        You may stop using EventLinqs at any time. Doing so does not release you from
        obligations to attendees who already hold tickets, or from refund, chargeback
        and reserve obligations on events already sold.
      </p>
      <p>
        We may suspend sales, withhold payouts, unpublish listings, or close your
        account where you materially breach this agreement, where we reasonably
        suspect fraud or unlawful activity, where your dispute rate is unacceptable,
        or where the law requires it. Except where the matter is serious or urgent,
        we will tell you first and give you a reasonable opportunity to fix it.
      </p>
      <p>
        On termination, funds properly owed for events already delivered remain
        payable to you, subject to refunds, chargebacks, reserves, and any debt you
        owe us. Sections covering fees owed, refunds, chargebacks, data obligations,
        liability and indemnity survive termination.
      </p>

      <h2 id="liability">Liability and Indemnity</h2>
      <p>
        Nothing in this agreement excludes, restricts or modifies any right or remedy
        under the Australian Consumer Law or other law that cannot lawfully be
        excluded.
      </p>
      <p>
        To the extent permitted by law, our total liability to you for all claims in
        any 12 month period is limited to the total fees we earned from your events in
        that period. Neither party is liable for indirect or consequential loss, or
        for loss of profit, revenue, goodwill or anticipated savings.
      </p>
      <p>
        <strong>You indemnify EventLinqs</strong> against claims, losses, penalties
        and reasonable legal costs arising from your event, your listings, your breach
        of this agreement or the law, your handling of attendee data, or claims by
        attendees, performers, venues, suppliers or regulators relating to your event.
        This does not apply to the extent the loss was caused by our own breach or
        negligence.
      </p>
      <p>
        You must hold public liability insurance appropriate to your events, and
        provide evidence of it on request.
      </p>

      <h2 id="changes">Changes to This Agreement</h2>
      <p>
        We may update this agreement as the platform and the law change. For material
        changes we will give you at least <strong>30 days notice</strong> by email or
        in your dashboard before they take effect.
      </p>
      <p>
        Events already on sale continue under the version in force when they were
        published, until they finish. If you do not accept a change, you may stop
        listing new events and we will pay out your existing events under the previous
        terms.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Organiser support:{' '}
        <a href="mailto:organisers@eventlinqs.com">organisers@eventlinqs.com</a>
      </p>
      <p>
        Cancellations and urgent event changes:{' '}
        <a href="mailto:organisers@eventlinqs.com">organisers@eventlinqs.com</a>,
        marked urgent.
      </p>
      <p>
        Legal notices:{' '}
        <a href="mailto:legal@eventlinqs.com">legal@eventlinqs.com</a>, or by post to
        PO Box 141, Newcomb VIC 3219, Australia.
      </p>

      <h2 id="related">Related Policies</h2>
      <ul>
        <li>
          <a href="/legal/terms">Terms of Service</a>: the agreement governing all use
          of EventLinqs.
        </li>
        <li>
          <a href="/legal/privacy">Privacy Policy</a>: how we handle personal
          information.
        </li>
        <li>
          <a href="/legal/refunds">Refund and Ticket Policy</a>: the refund rules you
          must honour.
        </li>
      </ul>
    </LegalPageShell>
  )
}
