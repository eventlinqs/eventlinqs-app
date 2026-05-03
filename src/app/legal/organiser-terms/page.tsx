import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/ui/LegalPageShell'

export const metadata: Metadata = {
  title: 'Organiser Terms | EventLinqs',
  description:
    'Terms that apply to event organisers who list, sell, or run events on EventLinqs, including payouts, fees, responsibilities, and prohibited content.',
  alternates: { canonical: '/legal/organiser-terms' },
}

const SECTIONS = [
  { id: 'intro',          title: 'Introduction' },
  { id: 'eligibility',    title: 'Eligibility' },
  { id: 'your-content',   title: 'Your Content and Listings' },
  { id: 'pricing-fees',   title: 'Pricing, Fees and Payouts' },
  { id: 'attendee-duties',title: 'Duties to Attendees' },
  { id: 'cancellations',  title: 'Cancellations and Reschedules' },
  { id: 'data',           title: 'Attendee Data and Privacy' },
  { id: 'prohibited',     title: 'Prohibited Conduct' },
  { id: 'suspension',     title: 'Suspension and Termination' },
  { id: 'disputes',       title: 'Chargebacks and Disputes' },
  { id: 'liability',      title: 'Liability' },
  { id: 'changes',        title: 'Changes to These Terms' },
  { id: 'contact',        title: 'Contact' },
]

export default function OrganiserTermsPage() {
  return (
    <LegalPageShell
      title="Organiser Terms"
      lastUpdated="25 April 2026"
      sections={SECTIONS}
    >
      <h2 id="intro">Introduction</h2>
      <p>
        These Organiser Terms sit on top of our general{' '}
        <a href="/legal/terms">Terms of Use</a> and apply whenever you
        use EventLinqs to list an event, sell tickets, or run an
        experience. They form a binding agreement between you and
        EventLinqs (operated by Lawal Adams, ABN 30 837 447 587,
        Geelong, Victoria, Australia). If the general Terms and these
        Organiser Terms conflict, the Organiser Terms take priority for
        organiser conduct.
      </p>

      <h2 id="eligibility">Eligibility</h2>
      <p>
        To publish a paid event you must be at least 18, legally capable
        of entering into contracts in your jurisdiction, and (if based in
        Australia) hold a valid ABN or equivalent business registration.
        You must provide accurate business and payout details and keep
        them current. Free events may be run by any verified account.
      </p>

      <h2 id="your-content">Your Content and Listings</h2>
      <p>
        You are responsible for everything you publish: event details,
        descriptions, images, pricing, capacity, venue information, and
        any organiser-set terms. You warrant that you hold the rights to
        all content you upload and that the event you are promoting will
        actually take place as described.
      </p>
      <p>
        EventLinqs may remove or edit listings that violate these terms,
        that are materially misleading, or that expose attendees to harm.
        We&apos;ll always tell you when we do this and why.
      </p>

      <h2 id="pricing-fees">Pricing, Fees and Payouts</h2>
      <p>
        EventLinqs uses an all-in pricing model: the price shown to the
        attendee is the price they pay. Platform fees are calculated and
        stored by our Pricing Service and shown transparently at
        checkout. Current rates are available in your organiser dashboard
        and will never change retroactively for events already on sale.
      </p>
      <p>
        Payouts are processed through Stripe Connect to the bank account
        you nominate. Standard payout cadence is after event completion,
        minus refunds, chargebacks, and applicable fees. Holdbacks may
        apply for new accounts, high-risk categories, or events with a
        history of chargebacks.
      </p>
      <p>
        Free events incur no platform fees. No exceptions, no conditions.
      </p>

      <h2 id="attendee-duties">Duties to Attendees</h2>
      <p>
        You are the contracting party for the event. You agree to honour
        every ticket sold, run the event as advertised, provide safe
        access, comply with all venue and regulatory obligations
        (including licensing, RSA, crowd management, and accessibility
        requirements), and respond to attendee queries within a
        reasonable time.
      </p>

      <h2 id="cancellations">Cancellations and Reschedules</h2>
      <p>
        If you cancel an event, EventLinqs will issue a full refund to
        every ticket holder, including all platform and service fees,
        deducted from your outstanding balance or subsequent payouts. If
        you reschedule, we will contact every ticket holder on your
        behalf and offer them the choice of keeping their ticket or
        requesting a refund.
      </p>

      <h2 id="data">Attendee Data and Privacy</h2>
      <p>
        Attendee contact details provided to you through EventLinqs may
        be used only for the purposes of running the specific event they
        bought a ticket to. You may not sell, rent, share, or repurpose
        attendee data for unrelated marketing, and you must comply with
        the Australian Privacy Principles and any other applicable data
        protection law (including the GDPR where relevant).
      </p>

      <h2 id="prohibited">Prohibited Conduct</h2>
      <ul>
        <li>Listing events you do not have the rights to run.</li>
        <li>
          Scalping, bulk reselling, or running bots to secure tickets on
          your own listings.
        </li>
        <li>
          Hidden fees, bait-and-switch pricing, or materially misleading
          listings.
        </li>
        <li>
          Discrimination against attendees on grounds protected by law.
        </li>
        <li>
          Uploading content that is illegal, hateful, sexually explicit
          (outside a clearly age-gated adult event), or infringing on
          another party&apos;s rights.
        </li>
      </ul>

      <h2 id="suspension">Suspension and Termination</h2>
      <p>
        We may suspend or terminate organiser access for breach of these
        terms, repeated attendee complaints, unsafe events, or fraud.
        Where possible we give notice and an opportunity to remedy, but
        we reserve the right to act immediately where attendee safety or
        platform integrity is at risk. Payouts may be withheld pending
        investigation.
      </p>

      <h2 id="disputes">Chargebacks and Disputes</h2>
      <p>
        Chargebacks initiated by attendees are debited from your balance.
        EventLinqs will contest chargebacks where we believe they are not
        justified, but the final outcome is determined by the card
        network. Persistent high chargeback rates may result in
        suspension or termination of your organiser account.
      </p>

      <h2 id="liability">Liability</h2>
      <p>
        EventLinqs provides the platform; you run the event. To the
        maximum extent permitted by law, EventLinqs is not liable for
        losses, injuries, or damages arising from the event itself. You
        indemnify EventLinqs against third-party claims that arise from
        your event or your breach of these terms. Nothing in this clause
        limits any non-excludable rights you have under the Australian
        Consumer Law.
      </p>

      <h2 id="changes">Changes to These Terms</h2>
      <p>
        We may update these Organiser Terms as the platform evolves.
        Material changes will be notified at least 14 days before they
        take effect, and we will never change the fee structure on
        events that are already on sale.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Questions about these Organiser Terms?{' '}
        <a href="mailto:organisers@eventlinqs.com">organisers@eventlinqs.com</a>.
      </p>
    </LegalPageShell>
  )
}
