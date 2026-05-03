import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/ui/LegalPageShell'

export const metadata: Metadata = {
  title: 'Accessibility | EventLinqs',
  description:
    'EventLinqs accessibility statement, conformance targets, known limitations, and how to report a barrier or request reasonable adjustment.',
  alternates: { canonical: '/legal/accessibility' },
  openGraph: {
    title: 'Accessibility | EventLinqs',
    description:
      'How EventLinqs builds for accessibility, our WCAG 2.1 AA target, and how to report a barrier.',
    url: '/legal/accessibility',
    type: 'website',
  },
}

const SECTIONS = [
  { id: 'commitment',     title: 'Our commitment' },
  { id: 'standard',       title: 'Conformance target' },
  { id: 'practices',      title: 'How we build' },
  { id: 'known-limits',   title: 'Known limitations' },
  { id: 'request-help',   title: 'Request adjustment' },
  { id: 'report-barrier', title: 'Report a barrier' },
  { id: 'legal',          title: 'Legal context' },
]

export default function AccessibilityPage() {
  return (
    <LegalPageShell
      title="Accessibility"
      lastUpdated="3 May 2026"
      sections={SECTIONS}
    >
      <h2 id="commitment">Our commitment</h2>
      <p>
        EventLinqs is built so that buying a ticket, organising an event, and
        navigating the platform are usable by everyone, including people with
        disability and people using assistive technology. Accessibility is a
        first-class engineering requirement, not an afterthought.
      </p>
      <p>
        We treat accessibility defects as we treat any production defect:
        triaged, ticketed, and fixed. We do not ship features that introduce
        new barriers without a documented mitigation plan.
      </p>

      <h2 id="standard">Conformance target</h2>
      <p>
        EventLinqs targets conformance to the Web Content Accessibility
        Guidelines (WCAG) 2.1 at Level AA across every public surface,
        including the homepage, event browse, event detail, checkout, organiser
        signup, and the help centre.
      </p>
      <p>
        Every public page is gated by an automated axe-core scan in our
        continuous integration pipeline, with a target of zero violations
        before merge to the main branch. Manual testing covers keyboard-only
        navigation, screen-reader usage, and reduced-motion behaviour.
      </p>

      <h2 id="practices">How we build</h2>
      <p>
        Our standing engineering practices include:
      </p>
      <ul>
        <li>Semantic HTML and ARIA only where native HTML is insufficient.</li>
        <li>Visible focus states on every interactive element, never removed.</li>
        <li>Touch targets of at least 44 by 44 pixels on mobile surfaces.</li>
        <li>Colour contrast at WCAG AA on body text and UI controls.</li>
        <li>Respect for the prefers-reduced-motion media query on every animation.</li>
        <li>Form fields that announce their label, state, and validation errors to screen readers.</li>
        <li>Captions and transcripts on any video content we publish.</li>
        <li>Plain-language copy. No jargon-as-progress.</li>
      </ul>

      <h2 id="known-limits">Known limitations</h2>
      <p>
        We publish known limitations rather than hide them. As of the date
        above, the platform has the following accessibility limitations on
        our active backlog:
      </p>
      <ul>
        <li>
          Some third-party event imagery uploaded by organisers may lack
          descriptive alt text. We are rolling out organiser-side prompts
          to require alt text at upload.
        </li>
        <li>
          The interactive map view on city pages is being rebuilt with a
          fully keyboard-navigable list view as the default presentation.
        </li>
        <li>
          A small number of legacy event detail pages still use a hero with
          decorative animation. Reduced-motion is respected, and these are
          on a planned rebuild path.
        </li>
      </ul>
      <p>
        These items are tracked publicly in our engineering log and will be
        cleared progressively before national launch.
      </p>

      <h2 id="request-help">Request a reasonable adjustment</h2>
      <p>
        If you need a reasonable adjustment to use EventLinqs, including
        alternative formats, additional time, or a different way of completing
        a checkout or organiser onboarding flow, contact us at
        <a href="mailto:hello@eventlinqs.com"> hello@eventlinqs.com</a> with
        the subject line &quot;Accessibility request&quot;. We aim to respond
        within one business day, Australian Eastern time.
      </p>
      <p>
        Requesting an adjustment never affects the price you pay, the
        availability of tickets shown to you, or your standing on the platform.
      </p>

      <h2 id="report-barrier">Report a barrier</h2>
      <p>
        If you encounter a barrier on the platform, please report it. We need
        to know about it so we can fix it. Email
        <a href="mailto:hello@eventlinqs.com"> hello@eventlinqs.com</a> with
        the subject line &quot;Accessibility barrier&quot; and as much of the
        following as you can share:
      </p>
      <ul>
        <li>The page URL where the barrier occurred.</li>
        <li>What you were trying to do.</li>
        <li>The device, browser, and assistive technology you were using.</li>
        <li>What you expected to happen and what happened instead.</li>
      </ul>
      <p>
        We treat every report as a defect ticket. We will acknowledge receipt,
        share an investigation outcome, and tell you when the fix has shipped.
      </p>

      <h2 id="legal">Legal context</h2>
      <p>
        EventLinqs is operated by an Australian sole trader (ABN 30 837 447
        587) registered in Geelong, Victoria. We are subject to the
        Disability Discrimination Act 1992 (Cth) in Australia, and we align
        our accessibility practice with the World Wide Web Consortium&apos;s
        Web Content Accessibility Guidelines 2.1 at Level AA.
      </p>
      <p>
        This statement is reviewed and updated as the platform evolves. The
        date at the top of this page reflects the most recent review.
      </p>
    </LegalPageShell>
  )
}
