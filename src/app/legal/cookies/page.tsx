import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/ui/LegalPageShell'

export const metadata: Metadata = {
  title: 'Cookie Policy | EventLinqs',
  description:
    'How EventLinqs uses cookies, local storage and similar technologies, what categories of data are collected, and how to control them.',
  alternates: { canonical: '/legal/cookies' },
}

const SECTIONS = [
  { id: 'what-cookies-are',  title: 'What Cookies Are' },
  { id: 'how-we-use-them',   title: 'How We Use Cookies' },
  { id: 'categories',        title: 'Cookie Categories' },
  { id: 'third-parties',     title: 'Third-Party Cookies' },
  { id: 'analytics',         title: 'Analytics (Plausible)' },
  { id: 'your-choices',      title: 'Your Choices' },
  { id: 'changes',           title: 'Changes to this Policy' },
  { id: 'contact',           title: 'Contact' },
]

export default function CookiesPage() {
  return (
    <LegalPageShell
      title="Cookie Policy"
      lastUpdated="25 April 2026"
      sections={SECTIONS}
    >
      <h2 id="what-cookies-are">What Cookies Are</h2>
      <p>
        Cookies are small text files that a website stores on your device
        when you visit. They let us remember preferences, keep you signed
        in, and understand how the platform is being used so we can make
        it better. This policy also covers local storage, session storage,
        and similar technologies that behave like cookies.
      </p>

      <h2 id="how-we-use-them">How We Use Cookies</h2>
      <p>
        EventLinqs (operated by Lawal Adams, ABN 30 837 447 587,
        Melbourne, Victoria, Australia) uses cookies for four things:
        keeping your session secure, remembering your preferences,
        understanding aggregate usage, and preventing abuse. We do not
        use cookies for third-party advertising and we never sell cookie
        data.
      </p>

      <h2 id="categories">Cookie Categories</h2>
      <p>We group cookies into four categories.</p>
      <ul>
        <li>
          <strong>Strictly necessary.</strong> Authentication, checkout
          session, CSRF protection, rate limiting. These cannot be
          disabled because the platform will not function without them.
          Examples: <code>sb-access-token</code>, <code>sb-refresh-token</code>,
          <code>el_city</code> (remembers your chosen browsing city).
        </li>
        <li>
          <strong>Preferences.</strong> Remember UI choices like the last
          viewed browsing city, currency, or list-vs-map view mode.
          Clearing them only resets those choices.
        </li>
        <li>
          <strong>Analytics.</strong> Cookieless or first-party analytics
          so we can see which pages are used and where the platform is
          slow. We aggregate this data and do not link it to your name
          or email.
        </li>
        <li>
          <strong>Fraud prevention.</strong> Used only when our abuse
          systems flag suspicious activity. These cookies help us tell
          real fans from bots and scalpers.
        </li>
      </ul>

      <h2 id="third-parties">Third-Party Cookies</h2>
      <p>
        A small number of our partners set their own cookies when their
        features are used on EventLinqs:
      </p>
      <ul>
        <li>
          <strong>Stripe</strong> sets cookies on the checkout page for
          payment security and fraud screening. These are required for
          card payments to complete.
        </li>
        <li>
          <strong>Supabase</strong> sets session cookies when you are
          signed in. These are first-party to <code>.eventlinqs.com</code>.
        </li>
        <li>
          <strong>Plausible Analytics</strong> (see the next section for
          the full details) is cookieless by design &mdash; no cookies are
          set on your device for analytics.
        </li>
      </ul>

      <h2 id="analytics">Analytics (Plausible)</h2>
      <p>
        EventLinqs uses <a href="https://plausible.io" rel="noopener">Plausible Analytics</a>,
        a privacy-friendly analytics service based in the European Union,
        to understand which pages people visit and how features are used.
        We chose Plausible specifically because it respects our attendees
        and organisers.
      </p>
      <ul>
        <li>
          <strong>Plausible does NOT use cookies</strong> and does NOT
          track you across websites. No fingerprinting, no shadow profile.
        </li>
        <li>
          <strong>Plausible only counts aggregated, anonymised page views
          and events on eventlinqs.com.</strong> We see counts and trends,
          not individual people.
        </li>
        <li>
          Data is processed in the European Union under GDPR compliance.
          No data is sold, shared with advertisers, or used to build an
          advertising profile.
        </li>
        <li>
          Plausible&apos;s public privacy statement is at{' '}
          <a href="https://plausible.io/privacy" rel="noopener">plausible.io/privacy</a>{' '}
          and their data policy at{' '}
          <a href="https://plausible.io/data-policy" rel="noopener">plausible.io/data-policy</a>.
        </li>
      </ul>
      <p>
        Alongside page views, we track a small set of named conversion
        events &mdash; viewing an event, starting checkout, completing a
        purchase, saving an event, searching, and organisers signing up
        &mdash; so we can improve the product. These events carry only
        non-identifying metadata (e.g. event id, category, city, price
        range). They never carry your name, email, or payment details.
      </p>

      <h2 id="your-choices">Your Choices</h2>
      <p>
        You can clear or block cookies in your browser at any time.
        Clearing them will sign you out and reset your preferences.
        Blocking strictly-necessary cookies will prevent login and
        checkout from working. Browser help pages:
      </p>
      <ul>
        <li>
          <a href="https://support.google.com/chrome/answer/95647" rel="noopener">Chrome</a>,{' '}
          <a href="https://support.mozilla.org/kb/cookies-information-websites-store-on-your-computer" rel="noopener">Firefox</a>,{' '}
          <a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" rel="noopener">Safari</a>,{' '}
          <a href="https://support.microsoft.com/microsoft-edge" rel="noopener">Edge</a>.
        </li>
      </ul>

      <h2 id="changes">Changes to this Policy</h2>
      <p>
        We&apos;ll update this page when our cookie use changes. The
        &ldquo;last updated&rdquo; date at the top will always reflect the
        most recent revision. Material changes will also be announced
        in-app.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Questions about cookies or how we handle your data?{' '}
        <a href="mailto:hello@eventlinqs.com">hello@eventlinqs.com</a>.
      </p>
    </LegalPageShell>
  )
}
