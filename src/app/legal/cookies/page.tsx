import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/ui/LegalPageShell'
import { PLATFORM_ENTITY } from '@/lib/legal/platform-entity'
import { contactAddress, contactMailto } from '@/lib/email/sender'

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
        EventLinqs (operated by Lawal Adams trading as EventLinqs,
        ABN {PLATFORM_ENTITY.abnFormatted}, {PLATFORM_ENTITY.postalAddress}) sets
        cookies where they are essential: keeping your session secure,
        completing checkout, remembering a few interface preferences, and
        preventing abuse. Our own traffic measurement is cookieless (see
        below), so no cookie is set to count a page view. We never sell
        cookie data.
      </p>
      <p>
        We also ask, once, whether you are willing to let us load two
        further kinds of measurement: product analytics, which show us
        where people give up on a form so we can fix it, and advertising
        measurement, which tells us which of our own adverts brought an
        organiser here. <strong>Neither loads until you say yes.</strong>
        If you say no, nothing is requested, nothing is stored, and the
        platform works identically: buying a ticket and running an event
        are unaffected either way. Your answer is remembered in a
        first-party cookie (<code>el_consent</code>) that records the
        choice and nothing else, so we do not have to keep asking.
      </p>

      <h2 id="categories">Cookie Categories</h2>
      <p>
        EventLinqs sets the following first-party cookies. The last two
        categories are set only if you agree to them.
      </p>
      <ul>
        <li>
          <strong>Strictly necessary.</strong> Authentication, checkout
          session, CSRF protection, and abuse prevention such as rate
          limiting. These cannot be disabled because login, ticket
          purchase, and basic security will not work without them.
          Examples: <code>sb-access-token</code>, <code>sb-refresh-token</code>.
        </li>
        <li>
          <strong>Preferences.</strong> A small number of first-party
          cookies that remember interface choices, such as your chosen
          browsing city (<code>el_city</code>), currency, or list-vs-map
          view. Clearing them only resets those choices; everything still
          works.
        </li>
        <li>
          <strong>Product analytics, only if you agree.</strong> PostHog,
          which records which steps of a form people reach so we can see
          where the platform is failing them. It is not loaded at all
          until you accept, and saying no leaves nothing behind.
        </li>
        <li>
          <strong>Advertising measurement, only if you agree.</strong>
          Google Analytics 4, Google Ads and the Meta pixel, which tell us
          which of our own adverts brought an organiser to the platform.
          These are the ones that can recognise you on other sites, which
          is why they are in their own category and why they are off until
          you say otherwise. None is loaded until you accept.
        </li>
      </ul>
      <p>
        Our own traffic measurement is handled cookielessly by Plausible
        (see below), so no cookie is set for it and it is outside the
        question above: it stores nothing on your device and cannot
        recognise you anywhere else. Payment fraud screening on the
        checkout page is performed by Stripe under its own cookies,
        described under Third-Party Cookies.
      </p>
      <p>
        You can change your mind at any time by clearing the
        <code>el_consent</code> cookie in your browser, which brings the
        question back on your next visit.
      </p>

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
          the full details) is cookieless by design - no cookies are
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
        events: viewing an event, starting checkout, completing a
        purchase, saving an event, searching, and organisers signing up.
        These events let us improve the product. They carry only
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
        <a href={contactMailto('hello')}>{contactAddress('hello')}</a>.
      </p>
    </LegalPageShell>
  )
}
