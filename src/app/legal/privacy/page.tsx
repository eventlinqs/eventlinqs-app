import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/ui/LegalPageShell'

export const metadata: Metadata = {
  title: 'Privacy Policy | EventLinqs',
  description:
    'How EventLinqs collects, uses, discloses and protects your personal information under the Privacy Act 1988 (Cth) and the Australian Privacy Principles, and how to access, correct or delete it.',
  alternates: { canonical: '/legal/privacy' },
}

const SECTIONS = [
  { id: 'about',           title: 'About This Policy' },
  { id: 'what-we-collect', title: 'What We Collect' },
  { id: 'how-we-collect',  title: 'How We Collect It' },
  { id: 'why-we-collect',  title: 'Why We Collect It' },
  { id: 'sensitive',       title: 'Sensitive Information' },
  { id: 'organisers',      title: 'Sharing With Organisers' },
  { id: 'providers',       title: 'Our Service Providers' },
  { id: 'overseas',        title: 'Overseas Disclosure' },
  { id: 'marketing',       title: 'Direct Marketing' },
  { id: 'cookies',         title: 'Cookies and Analytics' },
  { id: 'security',        title: 'How We Protect It' },
  { id: 'retention',       title: 'How Long We Keep It' },
  { id: 'access',          title: 'Access and Correction' },
  { id: 'deletion',        title: 'Deleting Your Data' },
  { id: 'breaches',        title: 'Data Breaches' },
  { id: 'children',        title: 'Children' },
  { id: 'complaints',      title: 'Complaints' },
  { id: 'changes',         title: 'Changes to This Policy' },
  { id: 'contact',         title: 'Contact Us' },
  { id: 'related',         title: 'Related Policies' },
]

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      lastUpdated="24 July 2026"
      sections={SECTIONS}
    >
      <h2 id="about">About This Policy</h2>
      <p>
        EventLinqs is operated by Lawal Adams, trading as EventLinqs, ABN 30 837
        447 587, PO Box 141, Newcomb VIC 3219, Australia. We are bound by the
        Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs), and
        we handle your personal information in accordance with them.
      </p>
      <p>
        This policy explains what personal information we collect, why we collect
        it, who we give it to, where it goes, how long we keep it, and how you can
        access, correct or delete it. It applies to everyone who uses EventLinqs,
        whether you buy a ticket, run an event, or just browse.
      </p>
      <p>
        &ldquo;Personal information&rdquo; means information or an opinion about
        an identified individual, or an individual who is reasonably identifiable,
        whether or not it is true and whether or not it is recorded in a material
        form.
      </p>

      <h2 id="what-we-collect">What We Collect</h2>
      <p>
        We collect only what we need to run a ticketing platform. The categories
        are:
      </p>
      <ul>
        <li>
          <strong>Account information:</strong> your name, email address, password
          (stored only as a cryptographic hash, never in readable form), and any
          profile details or photo you choose to add.
        </li>
        <li>
          <strong>Contact details:</strong> phone number and postal address where
          you provide them, for example when an organiser requires them for entry.
        </li>
        <li>
          <strong>Order and ticket information:</strong> the events and tickets you
          buy, order references, quantities, seat allocations, prices, the fees
          charged, discount codes used, refunds, and scan or admission records at
          the door.
        </li>
        <li>
          <strong>Payment information:</strong> we do <strong>not</strong> collect
          or store your full card number. Card details are entered directly into
          Stripe. We receive and store only a payment token, the card brand, the
          last four digits, the expiry, and the outcome of the transaction.
        </li>
        <li>
          <strong>Organiser and business information:</strong> if you sell tickets,
          your business or trading name, ABN, contact details, and payout bank
          account details. Identity verification documents go directly to Stripe,
          not to us.
        </li>
        <li>
          <strong>Preference and interest information:</strong> the events,
          organisers, artists and communities you follow, saved events, and the
          alert and notification settings you choose. This is what powers your
          discovery feed.
        </li>
        <li>
          <strong>Communications:</strong> emails and messages you send us, support
          enquiries, refund requests, and our replies.
        </li>
        <li>
          <strong>Technical information:</strong> IP address, browser and device
          type, operating system, referring page, pages viewed, and timestamps.
          Where you allow notifications, a push subscription identifier for your
          browser or device.
        </li>
        <li>
          <strong>Location information:</strong> the city or area you select, or
          that we infer approximately from your IP address, so we can show nearby
          events. We do not collect precise device location unless you explicitly
          grant it in your browser.
        </li>
      </ul>

      <h2 id="how-we-collect">How We Collect It</h2>
      <p>
        We collect personal information directly from you wherever it is reasonable
        and practicable to do so: when you create an account, buy a ticket, list an
        event, follow an organiser, contact support, or set your preferences.
      </p>
      <p>We also collect information:</p>
      <ul>
        <li>
          Automatically as you use the platform, through server logs, cookies and
          similar technologies.
        </li>
        <li>
          From Stripe, which tells us the result of a payment, the status of an
          organiser&apos;s identity verification, and details of any dispute.
        </li>
        <li>
          From an organiser, where they upload or import an attendee list for an
          event they are moving to EventLinqs.
        </li>
        <li>
          From another person, where they buy a ticket on your behalf and give us
          your name and email so we can issue your ticket.
        </li>
      </ul>
      <p>
        If we receive personal information about you that we did not ask for and
        could not lawfully have collected, we destroy or de-identify it where it is
        lawful and reasonable to do so.
      </p>

      <h2 id="why-we-collect">Why We Collect It</h2>
      <p>
        We use personal information only for the purposes below, for related
        purposes you would reasonably expect, and for any purpose you consent to or
        the law requires.
      </p>
      <ul>
        <li>
          <strong>To provide the service:</strong> to create your account, process
          your order, issue and validate tickets, admit you at the door, handle
          transfers, and process refunds.
        </li>
        <li>
          <strong>To communicate about your purchase:</strong> confirmations,
          tickets, reminders, changes to an event, postponements, cancellations and
          refund notices. These are essential service messages.
        </li>
        <li>
          <strong>To run payments and payouts:</strong> to charge you, to hold
          funds, to pay organisers, to calculate fees, and to manage chargebacks and
          disputes.
        </li>
        <li>
          <strong>To personalise discovery:</strong> to recommend events, build your
          feed, and send the alerts you have asked for based on the organisers,
          artists and communities you follow.
        </li>
        <li>
          <strong>To support you:</strong> to answer enquiries, investigate problems
          and resolve complaints.
        </li>
        <li>
          <strong>To keep the platform safe:</strong> to detect and prevent fraud,
          scalping, unauthorised access and misuse, and to enforce our{' '}
          <a href="/legal/terms">Terms of Service</a>.
        </li>
        <li>
          <strong>To improve the platform:</strong> to understand which features are
          used and where people get stuck, using aggregated and de-identified data
          wherever possible.
        </li>
        <li>
          <strong>To meet legal obligations:</strong> tax and financial records,
          responding to lawful requests, and complying with consumer, privacy and
          anti-money-laundering law.
        </li>
      </ul>
      <p>
        We do not sell your personal information. We do not disclose it to
        advertisers or data brokers, and we do not allow our service providers to
        use it for their own purposes.
      </p>

      <h2 id="sensitive">Sensitive Information</h2>
      <p>
        We do not ask for sensitive information as defined in the Privacy Act, such
        as health information, racial or ethnic origin, religious beliefs, political
        opinions, or sexual orientation.
      </p>
      <p>
        Some events on EventLinqs are associated with a community, a faith, or an
        identity. If you choose to follow one, save an event, or buy a ticket to
        one, that choice may reveal something personal about you. We treat that
        information carefully, use it only to run the service and show you relevant
        events, and never use it to target you on that basis outside the platform or
        disclose it for advertising.
      </p>
      <p>
        Where an organiser asks for information at checkout that is genuinely
        sensitive, for example dietary or accessibility requirements, we collect it
        only with your consent, pass it to that organiser for that event, and do not
        use it for anything else.
      </p>

      <h2 id="organisers">Sharing With Organisers</h2>
      <p>
        When you buy a ticket, the organiser of that event receives the information
        they need to run it: your name, email address, the tickets and any add-ons
        you bought, your order reference, any answers you gave to their checkout
        questions, and your attendance status at the door.
      </p>
      <p>
        <strong>
          The organiser is a separate entity and a separate handler of your
          information.
        </strong>{' '}
        Once they receive it, their own privacy obligations apply. We require
        organisers by contract to comply with Australian privacy law, to use
        attendee information only for that event and their own legitimate purposes,
        and never to sell it. We cannot control their conduct beyond that, so if you
        have a concern about a specific organiser you may contact them directly, and
        you may also tell us.
      </p>
      <p>
        <strong>Marketing by organisers is separate and opt-in.</strong> An organiser
        only receives you as a marketing contact if you tick the unticked consent box
        at checkout for that organiser. You can withdraw that consent at any time
        using the unsubscribe link in their emails, or by contacting us.
      </p>

      <h2 id="providers">Our Service Providers</h2>
      <p>
        We use a small number of established providers to operate the platform. Each
        receives only what it needs, and only to provide services to us.
      </p>
      <ul>
        <li>
          <strong>Stripe:</strong> our payment processor. Stripe handles card data,
          processes payments and refunds, verifies organiser identity, and manages
          disputes. Your card details go directly to Stripe&apos;s PCI-DSS certified
          systems and are never held by us. Stripe handles your information under its
          own privacy policy at{' '}
          <a
            href="https://stripe.com/au/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            stripe.com/au/privacy
          </a>
          .
        </li>
        <li>
          <strong>Supabase:</strong> our database, file storage and authentication
          provider. Your account, order and ticket records are stored here.
        </li>
        <li>
          <strong>Vercel:</strong> our hosting and content delivery provider. Your IP
          address and request data pass through Vercel as part of serving the site.
        </li>
        <li>
          <strong>Resend:</strong> our email delivery provider, used to send tickets,
          confirmations, event notices, and any newsletters you opted into.
        </li>
        <li>
          <strong>Upstash:</strong> caching and rate limiting, used to keep the
          platform fast and to block abuse.
        </li>
        <li>
          <strong>Sentry:</strong> error monitoring. When something breaks, Sentry
          records the technical details so we can fix it. This can include your IP
          address and the page you were on.
        </li>
        <li>
          <strong>Google Maps:</strong> used to display event locations. Loading a map
          shares your IP address with Google under its own privacy policy.
        </li>
        <li>
          <strong>Anthropic:</strong> powers the in-platform assistants. Where you use
          an assistant, the content of your questions is processed to generate a
          reply. We do not send payment data, and the content is not used to train
          external models.
        </li>
      </ul>
      <p>
        We may also disclose personal information to our professional advisers, to a
        purchaser if the business is sold (on the same privacy terms), and to a law
        enforcement body, court or regulator where the law requires or authorises it.
      </p>

      <h2 id="overseas">Overseas Disclosure</h2>
      <p>
        Several of our providers store or process data outside Australia. In
        practice, the countries most likely to receive your personal information are
        the <strong>United States</strong>, and other countries where those providers
        operate infrastructure, including within the European Union and Singapore.
      </p>
      <p>
        Before disclosing personal information overseas we take reasonable steps to
        ensure the recipient handles it in a way consistent with the Australian
        Privacy Principles, including through data protection terms with each
        provider. Our primary application and database infrastructure is configured
        to Australian and regional data centres where the provider offers that
        option.
      </p>
      <p>
        By using the platform you acknowledge that where information is handled
        overseas, the overseas recipient may not be subject to the Privacy Act, and
        you may not be able to seek redress under the Act in that country.
      </p>

      <h2 id="marketing">Direct Marketing</h2>
      <p>
        We separate essential service messages from marketing. Service messages, such
        as your ticket, a change to an event, or a refund notice, are not marketing
        and continue while you hold an account or a ticket.
      </p>
      <p>
        Marketing emails, including event recommendations and platform news, are sent
        only where you have opted in. Consistent with the Spam Act 2003 (Cth) and
        APP 7:
      </p>
      <ul>
        <li>Consent boxes are never pre-ticked.</li>
        <li>
          Consent to hear from EventLinqs is separate from consent to hear from an
          organiser.
        </li>
        <li>
          Every marketing message identifies who sent it and carries a working
          unsubscribe link.
        </li>
        <li>
          Unsubscribing does not require you to log in, and takes effect promptly.
        </li>
      </ul>
      <p>
        You can change your preferences at any time in your account settings, or by
        emailing{' '}
        <a href="mailto:privacy@eventlinqs.com">privacy@eventlinqs.com</a>. You may
        also ask us to tell you where we obtained your information.
      </p>

      <h2 id="cookies">Cookies and Analytics</h2>
      <p>
        We use cookies and similar technologies to keep you signed in, remember your
        cart and preferences, keep the platform secure, and understand how it is
        used. Essential cookies are required for the site to work. You can block or
        delete cookies in your browser, but parts of the platform, including
        checkout, may stop working.
      </p>
      <p>
        Full detail on the specific cookies we set is in our{' '}
        <a href="/legal/cookies">Cookie Policy</a>.
      </p>

      <h2 id="security">How We Protect It</h2>
      <p>
        We take reasonable steps to protect personal information from misuse,
        interference, loss, and unauthorised access, modification or disclosure.
        Those steps include:
      </p>
      <ul>
        <li>
          Encryption in transit (HTTPS) across the platform, and encryption at rest
          for stored data.
        </li>
        <li>Passwords stored only as salted cryptographic hashes.</li>
        <li>
          Row-level database security, so an account can only reach its own records.
        </li>
        <li>
          Two-factor authentication and role-based access controls on administrative
          functions.
        </li>
        <li>
          Card data confined to Stripe, so a breach of our systems cannot expose card
          numbers.
        </li>
        <li>
          Audit logging of privileged actions, rate limiting, and continuous error
          monitoring.
        </li>
        <li>Access limited to those who need it to do their job.</li>
      </ul>
      <p>
        No system is perfectly secure. If you believe your account has been
        compromised, contact us immediately at{' '}
        <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a>.
      </p>

      <h2 id="retention">How Long We Keep It</h2>
      <p>
        We keep personal information only as long as we need it for the purpose we
        collected it, or as long as the law requires.
      </p>
      <ul>
        <li>
          <strong>Account information:</strong> while your account is open, then
          removed or de-identified after closure, subject to the records below.
        </li>
        <li>
          <strong>Transaction and tax records:</strong> retained for at least{' '}
          <strong>7 years</strong>, as required by Australian taxation law. This
          applies even if you close your account.
        </li>
        <li>
          <strong>Ticket and attendance records:</strong> retained while needed to
          resolve disputes, chargebacks and refunds, then de-identified.
        </li>
        <li>
          <strong>Support correspondence:</strong> generally up to 3 years.
        </li>
        <li>
          <strong>Technical logs:</strong> generally up to 12 months, and shorter for
          routine access logs.
        </li>
      </ul>
      <p>
        When information is no longer needed and we are not required to keep it, we
        destroy it or de-identify it.
      </p>

      <h2 id="access">Access and Correction</h2>
      <p>
        Under APP 12 and APP 13 you have the right to ask for a copy of the personal
        information we hold about you, and to ask us to correct it if it is
        inaccurate, out of date, incomplete, irrelevant or misleading.
      </p>
      <p>
        Much of it you can see and change yourself at any time in your account
        settings, including your name, contact details, preferences and follows.
      </p>
      <p>
        <strong>To make a formal request,</strong> email{' '}
        <a href="mailto:privacy@eventlinqs.com">privacy@eventlinqs.com</a> with the
        subject line &ldquo;Access request&rdquo; or &ldquo;Correction
        request&rdquo;, from the email address on your account, telling us what you
        need. You can also write to PO Box 141, Newcomb VIC 3219.
      </p>
      <ul>
        <li>
          We acknowledge your request within <strong>5 business days</strong>.
        </li>
        <li>
          We respond within <strong>30 days</strong>. If a request is complex we will
          tell you before that deadline and agree a new date with you.
        </li>
        <li>
          We may need to verify your identity first, so that we do not disclose your
          information to someone else.
        </li>
        <li>We do not charge for making a request, or for a correction.</li>
        <li>
          If we refuse access or a correction, we will tell you in writing why, and
          how to complain. Where we refuse a correction you may ask us to attach a
          statement noting that you consider the information inaccurate.
        </li>
      </ul>

      <h2 id="deletion">Deleting Your Data</h2>
      <p>
        You can ask us to delete your personal information by emailing{' '}
        <a href="mailto:privacy@eventlinqs.com">privacy@eventlinqs.com</a> with the
        subject line &ldquo;Deletion request&rdquo;. We acknowledge within 5 business
        days and act within 30 days.
      </p>
      <p>
        When you ask us to delete your account we remove your profile, preferences,
        follows and marketing contact details, and we de-identify your remaining
        activity so it is no longer linked to you.
      </p>
      <p>
        <strong>What we cannot delete straight away.</strong> Some information must
        be retained, and we will tell you which of these applies:
      </p>
      <ul>
        <li>
          Financial and tax records of completed transactions, kept for 7 years by
          law.
        </li>
        <li>
          Records needed for a live dispute, chargeback, refund or legal claim, until
          it is resolved.
        </li>
        <li>
          Information an organiser holds independently, which you need to raise with
          that organiser. We will help you contact them and pass on your request.
        </li>
        <li>
          A record of an unsubscribe request, kept so we do not contact you again by
          mistake.
        </li>
      </ul>
      <p>
        Deleting your account does not cancel tickets you already hold. If an event
        you have a ticket for has not happened yet, tell us and we will make sure you
        can still get in or be refunded.
      </p>

      <h2 id="breaches">Data Breaches</h2>
      <p>
        We maintain a data breach response plan. If a data breach occurs that is
        likely to result in serious harm to you, we will notify you and the Office of
        the Australian Information Commissioner (OAIC) as required by the Notifiable
        Data Breaches scheme under Part IIIC of the Privacy Act.
      </p>
      <p>
        We will assess any suspected breach promptly, and within 30 days. Our
        notification will describe what happened, what information was involved, and
        the steps we recommend you take.
      </p>

      <h2 id="children">Children</h2>
      <p>
        EventLinqs is not intended for children under 16, and you must be at least 16
        to hold an account. We do not knowingly collect personal information from a
        child under 16 without parental consent.
      </p>
      <p>
        Children may of course attend events on tickets bought by an adult. Where an
        organiser requires the name of a child attendee, we collect only what is
        needed to admit them.
      </p>
      <p>
        If you believe a child has given us personal information without consent,
        contact{' '}
        <a href="mailto:privacy@eventlinqs.com">privacy@eventlinqs.com</a> and we
        will delete it promptly.
      </p>

      <h2 id="complaints">Complaints</h2>
      <p>
        If you think we have breached the Australian Privacy Principles or mishandled
        your personal information, please tell us. We take privacy complaints
        seriously and we would rather fix a problem than have you go elsewhere first.
      </p>
      <p>
        <strong>Step 1: complain to us.</strong> Email{' '}
        <a href="mailto:privacy@eventlinqs.com">privacy@eventlinqs.com</a> with the
        subject line &ldquo;Privacy complaint&rdquo;, or write to the Privacy
        Officer, EventLinqs, PO Box 141, Newcomb VIC 3219. Tell us what happened and
        what you would like us to do.
      </p>
      <ul>
        <li>
          We acknowledge your complaint within <strong>5 business days</strong>.
        </li>
        <li>
          We investigate and give you a written response within{' '}
          <strong>30 days</strong>. If we need longer, we will explain why and agree a
          timeframe with you.
        </li>
        <li>
          Our response will set out our findings, what we are doing about it, and what
          to do if you are not satisfied.
        </li>
      </ul>
      <p>
        <strong>Step 2: escalate to the OAIC.</strong> If you are not satisfied with
        our response, or we have not responded within 30 days, you can complain to the
        Office of the Australian Information Commissioner:
      </p>
      <ul>
        <li>
          Online:{' '}
          <a
            href="https://www.oaic.gov.au"
            target="_blank"
            rel="noopener noreferrer"
          >
            oaic.gov.au
          </a>
        </li>
        <li>Phone: 1300 363 992</li>
        <li>
          Email:{' '}
          <a href="mailto:enquiries@oaic.gov.au">enquiries@oaic.gov.au</a>
        </li>
        <li>Post: GPO Box 5218, Sydney NSW 2001</li>
      </ul>
      <p>The OAIC generally expects you to raise your complaint with us first.</p>

      <h2 id="changes">Changes to This Policy</h2>
      <p>
        We update this policy as the platform and the law change. The date at the top
        shows when it was last revised. For material changes affecting how we use your
        information, we will give you at least 30 days notice by email or through the
        platform before the change takes effect.
      </p>

      <h2 id="contact">Contact Us</h2>
      <p>
        Privacy questions, access, correction, deletion and complaints:{' '}
        <a href="mailto:privacy@eventlinqs.com">privacy@eventlinqs.com</a>
      </p>
      <p>
        General support:{' '}
        <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a>
      </p>
      <p>
        Post: The Privacy Officer, EventLinqs, PO Box 141, Newcomb VIC 3219,
        Australia.
      </p>

      <h2 id="related">Related Policies</h2>
      <ul>
        <li>
          <a href="/legal/terms">Terms of Service</a>: the agreement governing your
          use of EventLinqs.
        </li>
        <li>
          <a href="/legal/refunds">Refund and Ticket Policy</a>: refunds,
          cancellations and ticket conditions.
        </li>
        <li>
          <a href="/legal/organiser-terms">Organiser Agreement</a>: the terms for
          running events, including attendee data obligations.
        </li>
        <li>
          <a href="/legal/cookies">Cookie Policy</a>: the specific cookies we set.
        </li>
      </ul>
    </LegalPageShell>
  )
}
