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
          <strong>Analytics provider</strong> (Plausible) uses a
          cookieless approach where possible; when a cookie is set, it
          is first-party and contains no personal identifiers.
        </li>
      </ul>

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
