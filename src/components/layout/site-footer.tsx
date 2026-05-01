'use client'

import { EventlinqsLogo } from '@/components/ui/eventlinqs-logo'

/**
 * SiteFooter - dual-pattern footer.
 *
 * Spec §6.8:
 *   - Mobile (<768px): 3 accordions (Discover, Organisers, Help) + social icons
 *   - Desktop (768px+): dark 4-col grid (Logo+tagline | Discover | Organisers | Help)
 *   - Background: ink-900 (#0A1628) - deep navy
 *   - CTA strip above footer columns: "Every culture. Every event. One platform."
 *
 * Uses <details>/<summary> for mobile accordion - no JS, fully accessible,
 * respects prefers-reduced-motion via CSS.
 */

const FOOTER_LINKS = {
  discover: [
    { label: 'Browse all events',  href: '/events' },
    { label: 'Afrobeats',          href: '/categories/afrobeats' },
    { label: 'Amapiano',           href: '/categories/amapiano' },
    { label: 'Owambe',             href: '/categories/owambe' },
    { label: 'Caribbean',          href: '/categories/caribbean' },
    { label: 'Heritage',           href: '/categories/heritage-and-independence' },
  ],
  organisers: [
    { label: 'Start selling tickets', href: '/organisers/signup' },
    { label: 'How it works',          href: '/organisers' },
    { label: 'Pricing',               href: '/pricing' },
    { label: 'Organiser login',       href: '/login' },
  ],
  help: [
    { label: 'Help Centre',   href: '/help' },
    { label: 'Contact Us',    href: '/contact' },
    { label: 'Refunds',       href: '/help/refunds' },
    { label: 'Accessibility', href: '/help/accessibility' },
  ],
  company: [
    { label: 'About EventLinqs', href: '/about' },
    { label: 'Press',            href: '/press' },
    { label: 'Careers',          href: '/careers' },
    { label: 'Blog',             href: '/blog' },
  ],
  legal: [
    { label: 'Privacy Policy',   href: '/legal/privacy' },
    { label: 'Terms of Use',     href: '/legal/terms' },
    { label: 'Cookie Policy',    href: '/legal/cookies' },
    { label: 'Organiser Terms',  href: '/legal/organiser-terms' },
  ],
}

function TwitterIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.52V6.75a4.85 4.85 0 01-1.02-.06z" />
    </svg>
  )
}

export function SiteFooter() {
  return (
    <footer className="bg-ink-950 text-white" aria-label="Site footer">
      {/* Mobile accordion / Desktop 4-col grid */}
      <div className="mx-auto max-w-7xl px-4 pt-20 pb-10 sm:px-6 lg:px-8">

        {/* Desktop grid (hidden on mobile) - 6 equal columns: Brand + 5 link sections */}
        <div className="hidden md:grid md:grid-cols-6 md:gap-8">
          {/* Col 1 - Brand */}
          <div>
            <EventlinqsLogo size="lg" variant="inverted" />
            <p className="mt-3 text-sm leading-6 text-white/70">
              The ticketing platform built for every culture.
            </p>
            <div className="mt-6 flex gap-4">
              <a href="https://twitter.com/eventlinqs" aria-label="EventLinqs on X (Twitter)" className="text-white/70 hover:text-white transition-colors">
                <TwitterIcon />
              </a>
              <a href="https://instagram.com/eventlinqs" aria-label="EventLinqs on Instagram" className="text-white/70 hover:text-white transition-colors">
                <InstagramIcon />
              </a>
              <a href="https://tiktok.com/@eventlinqs" aria-label="EventLinqs on TikTok" className="text-white/70 hover:text-white transition-colors">
                <TikTokIcon />
              </a>
            </div>
          </div>

          {/* Col 2 - Discover */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Discover</p>
            <ul className="mt-4 space-y-3">
              {FOOTER_LINKS.discover.map(link => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 - Organisers */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Organisers</p>
            <ul className="mt-4 space-y-3">
              {FOOTER_LINKS.organisers.map(link => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4 - Help */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Help</p>
            <ul className="mt-4 space-y-3">
              {FOOTER_LINKS.help.map(link => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 5 - Company */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Company</p>
            <ul className="mt-4 space-y-3">
              {FOOTER_LINKS.company.map(link => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 6 - Legal */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Legal</p>
            <ul className="mt-4 space-y-3">
              {FOOTER_LINKS.legal.map(link => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Mobile accordions (hidden on md+) */}
        <div className="md:hidden space-y-0 divide-y divide-white/10 border-y border-white/10">
          {[
            { title: 'Discover',    links: FOOTER_LINKS.discover },
            { title: 'Organisers',  links: FOOTER_LINKS.organisers },
            { title: 'Help',        links: FOOTER_LINKS.help },
            { title: 'Company',     links: FOOTER_LINKS.company },
            { title: 'Legal',       links: FOOTER_LINKS.legal },
          ].map(section => (
            <details key={section.title} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
                {section.title}
                <svg
                  className="h-4 w-4 text-white/70 transition-transform group-open:rotate-180"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <ul className="pb-4 space-y-3">
                {section.links.map(link => (
                  <li key={link.href}>
                    <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>

        {/* Mobile social icons */}
        <div className="md:hidden mt-8 flex justify-center gap-6">
          <a href="https://twitter.com/eventlinqs" aria-label="EventLinqs on X (Twitter)" className="text-white/70 hover:text-white transition-colors">
            <TwitterIcon />
          </a>
          <a href="https://instagram.com/eventlinqs" aria-label="EventLinqs on Instagram" className="text-white/70 hover:text-white transition-colors">
            <InstagramIcon />
          </a>
          <a href="https://tiktok.com/@eventlinqs" aria-label="EventLinqs on TikTok" className="text-white/70 hover:text-white transition-colors">
            <TikTokIcon />
          </a>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10 py-6 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex flex-col items-center gap-2 text-center md:flex-row md:justify-between md:gap-6 md:text-left">
          <p className="text-xs text-white/70">
            © {new Date().getFullYear()} EventLinqs. All rights reserved.
          </p>
          <p className="hidden md:block text-xs text-white/70">
            The ticketing platform built for every culture.
          </p>
          <p className="text-xs text-white/70">
            Transparent pricing. Zero hidden fees. Always.
          </p>
        </div>
      </div>

    </footer>
  )
}
