import { canonicalHost, getSiteUrl } from '@/lib/site-url'
import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/ui/LegalPageShell'
import { getEventFeeRates } from '@/lib/pricing/event-fee-config'

export const metadata: Metadata = {
  title: 'Terms of Service | EventLinqs',
  description:
    'The terms that govern your use of EventLinqs, including accounts, ticket purchases, fees, acceptable use, liability, and your rights under Australian law.',
  alternates: { canonical: '/legal/terms' },
}

// The fee figures below are read live from `pricing_rules`. Without this the
// page would be statically rendered once and could quote a stale rate forever.
// 60s matches the resolver's own cache TTL and the /organisers precedent.
export const revalidate = 60

const SECTIONS = [
  { id: 'about',           title: 'About These Terms' },
  { id: 'our-role',        title: 'Our Role' },
  { id: 'eligibility',     title: 'Eligibility' },
  { id: 'accounts',        title: 'Your Account' },
  { id: 'buying',          title: 'Buying Tickets' },
  { id: 'fees',            title: 'Fees and Pricing' },
  { id: 'refunds',         title: 'Refunds' },
  { id: 'organisers',      title: 'If You Run Events' },
  { id: 'acceptable-use',  title: 'Acceptable Use' },
  { id: 'your-content',    title: 'Your Content' },
  { id: 'our-ip',          title: 'Our Intellectual Property' },
  { id: 'availability',    title: 'Availability of the Platform' },
  { id: 'consumer-rights', title: 'Consumer Guarantees' },
  { id: 'liability',       title: 'Liability' },
  { id: 'suspension',      title: 'Suspension and Termination' },
  { id: 'privacy',         title: 'Privacy' },
  { id: 'communications',  title: 'Communications' },
  { id: 'disputes',        title: 'Disputes and Governing Law' },
  { id: 'changes',         title: 'Changes to These Terms' },
  { id: 'contact',         title: 'Contact' },
  { id: 'related',         title: 'Related Policies' },
]

export default async function TermsOfServicePage() {
  // Live fee values from `pricing_rules` through the same resolver the charge
  // uses, so the rates quoted here can never drift from the rates charged.
  const rates = await getEventFeeRates({})
  const platformLabel = `${Number(rates.platformFeePercent.toFixed(2))}% + AUD ${(
    rates.platformFeeFixedCents / 100
  ).toFixed(2)}`
  // ONE FEE, 15 August 2026. The separate payment-processing fee was deleted and
  // card processing now comes out of the single fee above.

  return (
    <LegalPageShell
      title="Terms of Service"
      lastUpdated="24 July 2026"
      sections={SECTIONS}
    >
      <h2 id="about">About These Terms</h2>
      <p>
        These Terms of Service govern your use of EventLinqs, including the
        website at <a href={getSiteUrl()}>{canonicalHost()}</a>, any
        associated mobile experience, and every related service. By creating an
        account, buying a ticket, or listing an event, you agree to these terms.
        If you do not agree, please do not use the platform.
      </p>
      <p>
        EventLinqs is operated by Lawal Adams, trading as EventLinqs, ABN 30 837
        447 587, PO Box 141, Newcomb VIC 3219, Australia. In these terms,
        &ldquo;EventLinqs&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; and
        &ldquo;our&rdquo; mean that entity, and &ldquo;you&rdquo; means the
        person or organisation using the platform.
      </p>
      <p>
        Some parts of the platform have their own terms. The{' '}
        <a href="/legal/refunds">Refund and Ticket Policy</a> governs refunds and
        ticket conditions. The{' '}
        <a href="/legal/organiser-terms">Organiser Agreement</a> governs anyone
        who lists or sells events. The{' '}
        <a href="/legal/privacy">Privacy Policy</a> governs personal information.
        Those documents form part of your agreement with us.
      </p>

      <h2 id="our-role">Our Role</h2>
      <p>
        EventLinqs is a ticketing platform. We provide the technology that lets
        independent organisers list events, sell tickets, and manage attendees.
      </p>
      <p>
        <strong>The organiser, not EventLinqs, is the seller of the ticket and
        the provider of the event.</strong> We are not the event producer,
        promoter, venue operator, or co-organiser of any event listed on the
        platform, unless we say so explicitly on the event itself.
      </p>
      <p>
        For payments, EventLinqs acts as the organiser&apos;s limited payment
        collection agent. We collect the ticket money from you, hold it, and pay
        the organiser after the event. A payment made to EventLinqs discharges
        your obligation to pay the organiser for that ticket. Payments are
        processed by Stripe, and by paying you also accept{' '}
        <a
          href="https://stripe.com/au/legal"
          target="_blank"
          rel="noopener noreferrer"
        >
          Stripe&apos;s terms
        </a>
        .
      </p>

      <h2 id="eligibility">Eligibility</h2>
      <p>
        You must be at least 16 years old to hold an EventLinqs account. If you
        are under 18, you confirm that a parent or guardian has agreed to these
        terms on your behalf and accepts responsibility for your use of the
        platform.
      </p>
      <p>
        To sell paid tickets you must be at least 18, legally capable of entering
        contracts, and able to meet the requirements in the{' '}
        <a href="/legal/organiser-terms">Organiser Agreement</a>, including
        identity verification.
      </p>
      <p>
        Individual events may carry their own age restrictions set by the
        organiser or the venue. Meeting our eligibility requirements does not
        entitle you to enter an age-restricted event.
      </p>

      <h2 id="accounts">Your Account</h2>
      <p>
        You are responsible for the accuracy of the information you give us, and
        for keeping it current. Your name and email address matter: tickets,
        refunds, and cancellation notices all depend on them.
      </p>
      <p>
        Keep your password confidential. You are responsible for activity carried
        out through your account, unless it results from our own failure. If you
        believe your account has been accessed without your permission, tell us
        promptly at{' '}
        <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a> so we can
        secure it.
      </p>
      <p>
        Accounts are personal. Do not sell, share or transfer your account to
        anyone else. Organisations may give access to staff through the roles
        provided in the dashboard rather than by sharing a login.
      </p>

      <h2 id="buying">Buying Tickets</h2>
      <p>
        When you buy a ticket, you enter a contract with the organiser for
        attendance at that event, and a contract with us for the ticketing
        service. A ticket is a licence to attend a specific event on the stated
        date, subject to the organiser&apos;s conditions of entry and the
        venue&apos;s rules.
      </p>
      <p>
        Your order is confirmed when we issue your ticket and send confirmation,
        not when you submit payment details. Occasionally an order cannot be
        completed, for example where the last tickets sell during checkout or a
        listing contained a pricing error. Where that happens we refund you in
        full.
      </p>
      <p>
        Ticket conditions, transfers, resale limits, and entry requirements are
        set out in the <a href="/legal/refunds">Refund and Ticket Policy</a>.
      </p>

      <h2 id="fees">Fees and Pricing</h2>
      <p>
        EventLinqs charges a single fee of <strong>{platformLabel}</strong> per
        paid ticket. That is the whole fee: card processing is included in it and
        is not charged separately.{' '}
        <strong>Free events carry no fees.</strong>
      </p>
      <p>
        These are the current published rates, read live from our pricing system.
        Organisers may be on a promotional or negotiated rate, in which case the
        rate that applies to their event is the one charged.
      </p>
      <p>
        <strong>All-in pricing.</strong> The total amount you will pay, including
        every unavoidable fee, is shown to you on the event page as soon as you
        select tickets, before you commit to buy, and again at checkout. We do
        not reveal compulsory fees only at the final step.
      </p>
      <p>
        Organisers choose whether to pass fees on to you or absorb them. Where
        fees are absorbed, the displayed ticket price already includes them and
        the checkout says so.
      </p>
      <p>
        Prices are in Australian dollars and are inclusive of GST where GST
        applies. The organiser is responsible for GST on the ticket price.
      </p>

      <h2 id="refunds">Refunds</h2>
      <p>
        Refunds are governed by the{' '}
        <a href="/legal/refunds">Refund and Ticket Policy</a>, which forms part of
        these terms. In summary: a cancelled event is refunded in full including
        all fees, a rescheduled event gives you the choice of keeping your ticket
        or taking a full refund, and change of mind carries no automatic right to
        a refund.
      </p>
      <p>
        Nothing in these terms limits your rights under the Australian Consumer
        Law where those rights cannot lawfully be excluded.
      </p>

      <h2 id="organisers">If You Run Events</h2>
      <p>
        Listing or selling an event on EventLinqs means you also agree to the{' '}
        <a href="/legal/organiser-terms">Organiser Agreement</a>, which covers
        fees, payouts, cancellation obligations, chargeback liability, and
        prohibited events. Where these terms and the Organiser Agreement conflict
        on an organiser matter, the Organiser Agreement applies.
      </p>

      <h2 id="acceptable-use">Acceptable Use</h2>
      <p>You must not use EventLinqs to:</p>
      <ul>
        <li>
          Buy tickets using bots, scripts, or multiple accounts to get around
          published purchase limits.
        </li>
        <li>
          Resell tickets above the total amount you paid, or resell for
          commercial gain in breach of Australian ticket resale laws.
        </li>
        <li>
          Scrape, crawl, or harvest data from the platform without our written
          permission, or attempt to extract another user&apos;s personal
          information.
        </li>
        <li>
          Raise a chargeback you know to be unfounded, or provide false
          information to obtain a refund.
        </li>
        <li>
          Interfere with the platform&apos;s security or operation, including
          probing for vulnerabilities without authorisation, or introducing
          malicious code.
        </li>
        <li>
          Harass, threaten, defame or abuse other users, organisers, venue staff
          or our team.
        </li>
        <li>
          Impersonate another person or organisation, including EventLinqs, or
          misrepresent your association with anyone.
        </li>
        <li>
          List or promote an event prohibited under the{' '}
          <a href="/legal/organiser-terms">Organiser Agreement</a>, or otherwise
          use the platform for an unlawful purpose.
        </li>
      </ul>
      <p>
        We investigate suspected breaches and may suspend access while we do so.
        Serious matters may be reported to the police or a regulator.
      </p>

      <h2 id="your-content">Your Content</h2>
      <p>
        You keep ownership of everything you upload, including event
        descriptions, images, and video. You are responsible for having the
        rights to use it, including the rights to any photographs, artwork, music
        and performer likenesses.
      </p>
      <p>
        By uploading content you grant us a non-exclusive, royalty-free licence to
        host, store, reproduce, adapt for formatting and display, and publish that
        content for the purpose of operating and promoting the platform and your
        event, including in search results, listings, and platform marketing.
      </p>
      <p>
        This licence ends when you remove the content or close your account,
        except for copies already distributed in published material, and copies
        we must keep for legal or record-keeping reasons.
      </p>
      <p>
        We may remove content that breaches these terms, infringes someone
        else&apos;s rights, or exposes us to legal risk. If you believe content on
        EventLinqs infringes your copyright, contact{' '}
        <a href="mailto:legal@eventlinqs.com">legal@eventlinqs.com</a> with enough
        detail to identify the material.
      </p>

      <h2 id="our-ip">Our Intellectual Property</h2>
      <p>
        The platform itself, including its software, design, branding, and
        written material, belongs to EventLinqs or our licensors and is protected
        by Australian and international law. We grant you a personal,
        non-transferable, revocable licence to use the platform in line with these
        terms. Everything else is reserved.
      </p>
      <p>
        You must not copy, adapt, decompile, or create derivative works from the
        platform, or use our name and branding without written permission, except
        as needed to promote your own event listed with us.
      </p>

      <h2 id="availability">Availability of the Platform</h2>
      <p>
        We work to keep EventLinqs available and fast, and we monitor it
        continuously. We schedule maintenance outside peak hours wherever we can.
      </p>
      <p>
        We do not guarantee uninterrupted or error-free service. We are not
        responsible for interruptions caused by matters outside our reasonable
        control, including failures at infrastructure providers, network outages,
        natural disasters, industrial action, or government action.
      </p>
      <p>
        If an outage on our side stops you completing a purchase, contact us and
        we will help. If it stops an organiser selling tickets, the remedies in
        the <a href="/legal/organiser-terms">Organiser Agreement</a> apply.
      </p>

      <h2 id="consumer-rights">Consumer Guarantees</h2>
      <p>
        Our services come with guarantees that cannot be excluded under the
        Australian Consumer Law. Nothing in these terms excludes, restricts or
        modifies those guarantees, or any other right or remedy you have under a
        law that cannot lawfully be excluded.
      </p>
      <p>
        For a major failure with the ticketing service we provide, you are
        entitled to cancel your service contract with us and to a refund of the
        unused portion, or to compensation for the reduction in value. You are
        also entitled to be compensated for any other reasonably foreseeable loss
        or damage. If the failure is not major, you are entitled to have the
        problem fixed within a reasonable time, and if it is not fixed, to cancel
        and obtain a refund.
      </p>

      <h2 id="liability">Liability</h2>
      <p>
        Because we are not the provider of the events sold here, we are not
        responsible for the event itself. Subject always to the consumer
        guarantees above, we are not liable for:
      </p>
      <ul>
        <li>The quality, safety, content or delivery of any event.</li>
        <li>
          Injury, loss or damage suffered at or in connection with an event.
        </li>
        <li>
          The acts or omissions of organisers, venues, performers, or other
          attendees.
        </li>
        <li>
          An event being cancelled, postponed, rescheduled or changed by the
          organiser, beyond the refund obligations in our{' '}
          <a href="/legal/refunds">Refund and Ticket Policy</a>.
        </li>
        <li>
          Your inability to attend for personal reasons, including illness,
          travel, or work.
        </li>
      </ul>
      <p>
        To the extent permitted by law, and except where the consumer guarantees
        say otherwise, neither party is liable for indirect or consequential loss,
        or for loss of profit, revenue, goodwill or anticipated savings.
      </p>
      <p>
        To the extent permitted by law, our total liability to you for all claims
        connected with your use of the platform in any 12 month period is limited
        to the greater of the total fees you paid EventLinqs in that period, or
        AUD 100. Where liability arises under a consumer guarantee that can be
        limited, our liability is limited to resupplying the service or paying the
        cost of resupply.
      </p>
      <p>
        Nothing in this section limits liability for fraud, or for death or
        personal injury caused by our negligence, or any other liability that
        cannot lawfully be limited.
      </p>

      <h2 id="suspension">Suspension and Termination</h2>
      <p>
        You may close your account at any time. Closing your account does not
        cancel tickets you have already bought, or release an organiser from
        obligations for events already sold.
      </p>
      <p>
        We may suspend or close your account where you materially breach these
        terms, where we reasonably suspect fraud or unlawful activity, or where we
        are required to by law. Except where the matter is serious or urgent, we
        will tell you first and give you a reasonable chance to put it right.
      </p>
      <p>
        Where we close an organiser account, funds properly owed for events
        already delivered remain payable in line with the{' '}
        <a href="/legal/organiser-terms">Organiser Agreement</a>, subject to any
        refund, chargeback or reserve obligations.
      </p>

      <h2 id="privacy">Privacy</h2>
      <p>
        We handle personal information in line with the Privacy Act 1988 (Cth)
        and the Australian Privacy Principles. Our{' '}
        <a href="/legal/privacy">Privacy Policy</a> explains what we collect, why,
        who we share it with, and how to access, correct or delete it.
      </p>
      <p>
        When you buy a ticket, the organiser of that event receives the attendee
        information they need to run it. The organiser is a separate entity
        responsible for its own handling of that information.
      </p>

      <h2 id="communications">Communications</h2>
      <p>
        We send transactional messages you cannot opt out of while you hold an
        account or a ticket, such as order confirmations, tickets, event changes,
        cancellations and refund notices. These are necessary to deliver the
        service.
      </p>
      <p>
        Marketing messages are separate. We only send them where you have opted
        in, consistent with the Spam Act 2003 (Cth), and every one carries an
        unsubscribe link that works without logging in.
      </p>

      <h2 id="disputes">Disputes and Governing Law</h2>
      <p>
        If you have a problem, contact us first at{' '}
        <a href="mailto:legal@eventlinqs.com">legal@eventlinqs.com</a>. Most
        matters are resolved quickly this way, and we ask that you raise it with
        us before starting a formal process.
      </p>
      <p>
        If we cannot resolve it within 30 days, either of us may refer the matter
        to mediation administered by the Resolution Institute, with each party
        bearing its own costs and sharing the mediator&apos;s fee equally.
      </p>
      <p>
        These terms are governed by the laws of Victoria, Australia. Both parties
        submit to the non-exclusive jurisdiction of the courts of Victoria.
        Nothing here prevents you from bringing a claim in a tribunal or a court
        that a consumer protection law entitles you to use, or from complaining to
        a regulator.
      </p>

      <h2 id="changes">Changes to These Terms</h2>
      <p>
        We may update these terms as the platform develops or the law changes.
        For material changes we will give you at least 30 days notice by email or
        through the platform before they take effect.
      </p>
      <p>
        If you do not accept a change, you may close your account before it takes
        effect. The version in force when you bought a ticket continues to govern
        that purchase. The current version always sits at{' '}
        <a href="/legal/terms">{canonicalHost()}/legal/terms</a>.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        General support:{' '}
        <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a>
      </p>
      <p>
        Ticket and refund enquiries:{' '}
        <a href="mailto:support@eventlinqs.com">support@eventlinqs.com</a>
      </p>
      <p>
        Legal notices:{' '}
        <a href="mailto:legal@eventlinqs.com">legal@eventlinqs.com</a>, or by post
        to PO Box 141, Newcomb VIC 3219, Australia.
      </p>

      <h2 id="related">Related Policies</h2>
      <ul>
        <li>
          <a href="/legal/privacy">Privacy Policy</a>: what we do with your
          personal information.
        </li>
        <li>
          <a href="/legal/refunds">Refund and Ticket Policy</a>: refunds,
          cancellations, and ticket conditions.
        </li>
        <li>
          <a href="/legal/organiser-terms">Organiser Agreement</a>: the terms for
          running events on EventLinqs.
        </li>
      </ul>
    </LegalPageShell>
  )
}
