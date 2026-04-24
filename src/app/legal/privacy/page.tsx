import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/ui/LegalPageShell'

export const metadata: Metadata = {
  title: 'Privacy Policy | EventLinqs',
  description:
    'How EventLinqs collects, uses, and protects your personal information. Read our full Privacy Policy.',
}

const SECTIONS = [
  { id: 'introduction',          title: 'Introduction' },
  { id: 'information-we-collect', title: 'Information We Collect' },
  { id: 'how-we-use',            title: 'How We Use Your Information' },
  { id: 'cookies',               title: 'Cookies and Tracking' },
  { id: 'third-parties',         title: 'Third Parties' },
  { id: 'international-transfers', title: 'International Transfers' },
  { id: 'data-retention',        title: 'Data Retention' },
  { id: 'your-rights',           title: 'Your Rights' },
  { id: 'children',              title: 'Children' },
  { id: 'security',              title: 'Security' },
  { id: 'contact',               title: 'Contact' },
]

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      lastUpdated="15 April 2026"
      sections={SECTIONS}
    >
      <h2 id="introduction">Introduction</h2>
      <p>
        EventLinqs is operated by Lawal Adams (trading as EventLinqs, ABN 30 837 447 587),
        based in Melbourne, Victoria, Australia. We build technology that connects event
        organisers and attendees. We take the trust you place in us seriously.
      </p>
      <p>
        This Privacy Policy explains what personal information we collect, why we collect
        it, how we use and protect it, and what rights you have over your data. It applies
        to everyone who uses the EventLinqs platform, including the website at{' '}
        <a href="https://eventlinqs.com">eventlinqs.com</a>, our mobile experience, and
        any related services. By using EventLinqs, you agree to the practices described here.
      </p>
      <p>
        We are committed to the Australian Privacy Principles (APPs) under the{' '}
        <em>Privacy Act 1988 (Cth)</em>. If you have questions at any point, contact us at{' '}
        <a href="mailto:privacy@eventlinqs.com">privacy@eventlinqs.com</a>.
      </p>

      <h2 id="information-we-collect">Information We Collect</h2>
      <p>We collect information in the following categories:</p>
      <ul>
        <li>
          <strong>Account data.</strong> When you create an account, we collect your name,
          email address, and optionally your phone number and profile photo. Organisers
          also provide their organisation name and bank account details for payouts.
        </li>
        <li>
          <strong>Transaction data.</strong> When you purchase a ticket, we record the
          event, ticket tier, quantity, price paid, and transaction reference. All card
          payments are processed directly by Stripe. We never see or store your card
          number, CVV, or full card details.
        </li>
        <li>
          <strong>Event attendance data.</strong> We record which events you have
          attended or purchased tickets for, including scan timestamps when your QR ticket
          is validated at the door.
        </li>
        <li>
          <strong>Device and usage data.</strong> When you browse EventLinqs, we
          automatically collect your IP address, browser type, device type, operating
          system, and the pages you visit. This helps us understand how the platform is
          being used and diagnose technical problems.
        </li>
        <li>
          <strong>Communications.</strong> If you contact us via email, our contact form,
          or social media, we retain those communications to help us respond and improve
          our support quality.
        </li>
        <li>
          <strong>Cookies.</strong> See the Cookies and Tracking section below.
        </li>
      </ul>

      <h2 id="how-we-use">How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Deliver your tickets and send purchase confirmations and QR codes by email.</li>
        <li>Process payments and handle refunds through our payment partners.</li>
        <li>Send event reminders, updates, and essential service notifications.</li>
        <li>
          Personalise your experience by recommending events based on your location and
          past attendance, with your consent.
        </li>
        <li>
          Improve the platform by understanding what works and what doesn&apos;t through
          aggregated usage analytics.
        </li>
        <li>
          Comply with legal obligations, including tax record-keeping under Australian
          law and responding to lawful government requests.
        </li>
        <li>
          Prevent fraud by detecting abnormal purchasing patterns, bot activity, and
          ticket scalping.
        </li>
      </ul>
      <p>
        We will not use your information for automated decision-making that has significant
        legal or financial consequences without obtaining your explicit consent first.
      </p>

      <h2 id="cookies">Cookies and Tracking</h2>
      <p>
        We use three categories of cookies. You can manage your preferences via our
        cookie settings, accessible from the footer of any page.
      </p>
      <ul>
        <li>
          <strong>Essential cookies</strong> (always active). These are required for the
          platform to function. They include your session token (so you stay logged in),
          your shopping cart state, and security tokens. You cannot opt out of these while
          using the service.
        </li>
        <li>
          <strong>Analytics cookies</strong> (opt-out available). We use PostHog to
          understand how visitors navigate EventLinqs: which pages are popular, where
          people drop off in checkout, and how features are used. This data is
          aggregated and never sold. You can opt out in your account settings or via
          your browser&apos;s Do Not Track setting.
        </li>
        <li>
          <strong>Marketing cookies</strong> (opt-in only). We only place marketing
          or retargeting cookies if you explicitly consent. These allow us to show
          you relevant EventLinqs content on other platforms. We do not enable these
          by default.
        </li>
      </ul>

      <h2 id="third-parties">Third Parties Who Receive Your Data</h2>
      <p>
        We share your data only with service providers necessary to run the platform.
        We do not sell your data to advertisers, data brokers, or any third party.
      </p>
      <ul>
        <li>
          <strong>Stripe:</strong> payment processing. Your card details go directly
          to Stripe&apos;s PCI-compliant infrastructure. Stripe&apos;s privacy policy
          governs how they handle payment data.
        </li>
        <li>
          <strong>Supabase:</strong> our database and authentication provider. Your
          account data and transaction records are stored in Supabase&apos;s
          infrastructure.
        </li>
        <li>
          <strong>Resend:</strong> email delivery. Your email address and ticket
          details are passed to Resend to send transactional emails (purchase
          confirmations, QR codes, reminders).
        </li>
        <li>
          <strong>Vercel:</strong> web hosting. Your IP address and request data
          pass through Vercel&apos;s infrastructure as a normal part of web hosting.
        </li>
        <li>
          <strong>Upstash:</strong> caching. Anonymised session data and inventory
          snapshots are cached via Upstash Redis to improve performance.
        </li>
      </ul>
      <p>
        We require all service providers to maintain appropriate security standards
        and to use your data solely to provide services to EventLinqs.
      </p>

      <h2 id="international-transfers">International Data Transfers</h2>
      <p>
        EventLinqs is based in Australia, but some of our infrastructure providers
        store and process data on servers located in the United States and the
        European Union. When your data is transferred internationally, we rely on:
      </p>
      <ul>
        <li>
          Standard contractual clauses approved by relevant data protection authorities.
        </li>
        <li>
          The providers&apos; own compliance frameworks: Stripe (PCI DSS), Supabase
          (SOC 2), and Vercel (ISO 27001) each maintain robust security certifications.
        </li>
      </ul>
      <p>
        We take all reasonable steps to ensure that cross-border transfers of your
        personal information comply with the Australian Privacy Act.
      </p>

      <h2 id="data-retention">Data Retention</h2>
      <p>We retain your data for the following periods:</p>
      <ul>
        <li>
          <strong>Account data:</strong> retained while your account is active.
          If you close your account, we delete identifiable account data within
          90 days, subject to the exceptions below.
        </li>
        <li>
          <strong>Financial records:</strong> retained for 7 years after the
          transaction date, as required by Australian tax law (ATO record-keeping
          obligations).
        </li>
        <li>
          <strong>Event attendance data:</strong> retained for 3 years to support
          fraud prevention and dispute resolution.
        </li>
        <li>
          <strong>Marketing preferences:</strong> retained until you withdraw
          consent or close your account, whichever comes first.
        </li>
      </ul>

      <h2 id="your-rights">Your Rights</h2>
      <p>
        Under the Australian Privacy Act and, where applicable, the GDPR, you have
        the following rights:
      </p>
      <ul>
        <li>
          <strong>Access.</strong> You can request a copy of the personal information
          we hold about you.
        </li>
        <li>
          <strong>Correction.</strong> If your information is inaccurate or
          incomplete, you can ask us to correct it, or update it directly in your
          account settings.
        </li>
        <li>
          <strong>Deletion.</strong> You can request deletion of your account and
          associated data, subject to our legal retention obligations.
        </li>
        <li>
          <strong>Portability.</strong> You can request a machine-readable copy of
          your data to transfer to another service.
        </li>
        <li>
          <strong>Withdrawal of consent.</strong> Where processing is based on your
          consent (e.g. marketing emails), you can withdraw that consent at any time
          via your account settings or by emailing us.
        </li>
        <li>
          <strong>Complaint.</strong> If you believe we have mishandled your data,
          you have the right to lodge a complaint with the{' '}
          <a
            href="https://www.oaic.gov.au"
            target="_blank"
            rel="noopener noreferrer"
          >
            Office of the Australian Information Commissioner (OAIC)
          </a>
          .
        </li>
      </ul>
      <p>
        To exercise any of these rights, contact us at{' '}
        <a href="mailto:privacy@eventlinqs.com">privacy@eventlinqs.com</a>. We will
        respond within 30 days.
      </p>

      <h2 id="children">Children</h2>
      <p>
        EventLinqs is not intended for children under the age of 16. We do not
        knowingly collect personal information from anyone under 16 without verified
        parental or guardian consent. If you are a parent or guardian and believe
        your child has provided us with personal information without your consent,
        please contact us immediately at{' '}
        <a href="mailto:privacy@eventlinqs.com">privacy@eventlinqs.com</a> and we
        will delete the information promptly.
      </p>

      <h2 id="security">Security</h2>
      <p>
        We take the security of your personal information seriously. Our measures
        include:
      </p>
      <ul>
        <li>
          <strong>Encryption in transit.</strong> All data between your browser and
          EventLinqs is transmitted over HTTPS with TLS 1.2 or higher.
        </li>
        <li>
          <strong>Encryption at rest.</strong> Your data is encrypted at the database
          level by Supabase using AES-256.
        </li>
        <li>
          <strong>Row-level security.</strong> Our database enforces strict
          access control policies. Your data is only accessible to you and
          explicitly authorised platform functions.
        </li>
        <li>
          <strong>PCI compliance.</strong> All card payment data is handled
          exclusively by Stripe, who maintain PCI DSS Level 1 compliance. We
          never touch your raw card details.
        </li>
      </ul>
      <p>
        Despite these measures, no internet transmission is completely secure.
        If you believe your account has been compromised, contact us immediately.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        For all privacy-related enquiries, requests, or complaints, please contact us:
      </p>
      <ul>
        <li>
          <strong>Privacy enquiries:</strong>{' '}
          <a href="mailto:privacy@eventlinqs.com">privacy@eventlinqs.com</a>
        </li>
        <li>
          <strong>General enquiries:</strong>{' '}
          <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a>
        </li>
      </ul>
      <p>
        We aim to respond to all privacy requests within 30 days. For urgent
        matters, please mark your subject line <em>URGENT: Privacy</em>.
      </p>
    </LegalPageShell>
  )
}
