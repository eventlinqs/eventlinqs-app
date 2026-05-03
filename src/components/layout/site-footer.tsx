import { EventlinqsLogo } from '@/components/ui/eventlinqs-logo'

/**
 * SiteFooter v3 - 6-column layout, every link verified to a real route.
 *
 * Mobile (<768px):
 *   - 5 collapsed accordions: Discover, Cultures, Cities, For organisers, Company
 *   - Below: language picker, social row, sub-footer
 *
 * Desktop (768px+):
 *   - 6-column grid: Brand | Discover | Cultures | Cities | Organisers | Company
 *   - Sub-footer: social, legal, trust line, ABN, address, copyright
 *
 * Background: ink-950. Sentence-case heads. Australian English. No
 * em-dashes, no exclamation marks. Every href verified against a real
 * /app route or external service before commit.
 */

const DISCOVER = [
  { label: 'Browse all events', href: '/events' },
  { label: 'By city',           href: '/events?view=cities' },
  { label: 'By culture',        href: '/events?view=cultures' },
  { label: 'This week',         href: '/events?when=this-week' },
  { label: 'This weekend',      href: '/events?when=this-weekend' },
  { label: 'Free events',       href: '/events?price=free' },
]

const CULTURES = [
  { label: 'Afrobeats',                href: '/categories/afrobeats' },
  { label: 'Caribbean',                href: '/categories/caribbean' },
  { label: 'Amapiano',                 href: '/categories/amapiano' },
  { label: 'Gospel',                   href: '/categories/gospel' },
  { label: 'Owambe',                   href: '/categories/owambe' },
  { label: 'Heritage and Independence', href: '/categories/heritage-and-independence' },
  { label: 'Business and Networking',   href: '/categories/networking' },
]

const CITIES = [
  { label: 'Melbourne', href: '/events/browse/melbourne' },
  { label: 'Sydney',    href: '/events/browse/sydney' },
  { label: 'Brisbane',  href: '/events/browse/brisbane' },
  { label: 'Perth',     href: '/events/browse/perth' },
  { label: 'Adelaide',  href: '/events/browse/adelaide' },
  { label: 'Canberra',  href: '/events/browse/canberra' },
  { label: 'All cities', href: '/events?view=cities' },
]

const FOR_ORGANISERS = [
  { label: 'Sell tickets',     href: '/organisers/signup' },
  { label: 'Organiser guide',  href: '/organisers' },
  { label: 'Pricing',          href: '/pricing' },
  { label: 'Help centre',      href: '/help/selling-tickets' },
  { label: 'Organiser terms',  href: '/legal/organiser-terms' },
  { label: 'Organiser login',  href: '/login' },
]

const COMPANY = [
  { label: 'About',     href: '/about' },
  { label: 'Careers',   href: '/careers' },
  { label: 'Press',     href: '/press' },
  { label: 'Journal',   href: '/blog' },
  { label: 'Help',      href: '/help' },
  { label: 'Contact',   href: '/contact' },
]

const LEGAL = [
  { label: 'Terms',          href: '/legal/terms' },
  { label: 'Privacy',        href: '/legal/privacy' },
  { label: 'Refund policy',  href: '/legal/refunds' },
  { label: 'Cookie policy',  href: '/legal/cookies' },
  { label: 'Accessibility',  href: '/legal/accessibility' },
]

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

function XIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      className="h-4 w-4 text-white/70 transition-transform group-open:rotate-180"
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

interface FooterColumnProps {
  title: string
  links: { label: string; href: string }[]
}

function DesktopColumn({ title, links }: FooterColumnProps) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-white/70">{title}</p>
      <ul className="mt-4 space-y-3">
        {links.map(link => (
          <li key={link.href}>
            <a href={link.href} className="text-sm text-white/70 transition-colors hover:text-white">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MobileAccordion({ title, links }: FooterColumnProps) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronIcon />
      </summary>
      <ul className="space-y-3 pb-4">
        {links.map(link => (
          <li key={link.href}>
            <a href={link.href} className="block py-1 text-sm text-white/70 transition-colors hover:text-white">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}

function SocialRow() {
  const items = [
    { label: 'Instagram',  href: 'https://instagram.com/eventlinqs', icon: <InstagramIcon /> },
    { label: 'TikTok',     href: 'https://tiktok.com/@eventlinqs',   icon: <TikTokIcon /> },
    { label: 'X',          href: 'https://twitter.com/eventlinqs',   icon: <XIcon /> },
    { label: 'LinkedIn',   href: 'https://linkedin.com/company/eventlinqs', icon: <LinkedInIcon /> },
    { label: 'Facebook',   href: 'https://facebook.com/eventlinqs',  icon: <FacebookIcon /> },
  ]
  return (
    <div className="flex items-center gap-5">
      {items.map(it => (
        <a
          key={it.label}
          href={it.href}
          aria-label={`EventLinqs on ${it.label}`}
          className="flex h-11 w-11 items-center justify-center text-white/70 transition-colors hover:text-white"
        >
          {it.icon}
        </a>
      ))}
    </div>
  )
}

function LanguagePicker() {
  return (
    <label className="flex items-center gap-2 text-xs text-white/60">
      <span className="sr-only">Language</span>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15 15 0 010 20M12 2a15 15 0 000 20" />
      </svg>
      <select
        defaultValue="en-AU"
        className="bg-transparent text-xs text-white/70 outline-none focus:text-white"
        aria-label="Language"
      >
        <option value="en-AU" className="bg-ink-950">English (AU)</option>
      </select>
    </label>
  )
}

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-ink-950 text-white" aria-label="Site footer">
      <div className="mx-auto max-w-7xl px-4 pt-16 pb-10 sm:px-6 sm:pt-20 lg:px-8">

        {/* Desktop 12-col grid: brand 3 / 5 link cols at ~1.8 each */}
        <div className="hidden md:grid md:grid-cols-12 md:gap-x-8 md:gap-y-12">
          {/* Brand block - 3 of 12 */}
          <div className="md:col-span-3">
            <EventlinqsLogo size="lg" variant="inverted" />
            <p className="mt-3 max-w-xs text-sm leading-6 text-white/70">
              The ticketing platform built for every culture.
            </p>
            <p className="mt-3 max-w-xs text-xs leading-5 text-white/50">
              Every culture. Every event. One platform.
            </p>
            <div className="mt-6">
              <LanguagePicker />
            </div>
          </div>

          {/* Five link columns share remaining 9 cols */}
          <div className="md:col-span-2 md:col-start-4">
            <DesktopColumn title="Discover" links={DISCOVER} />
          </div>

          <div className="md:col-span-2">
            <DesktopColumn title="Cultures" links={CULTURES} />
          </div>

          <div className="md:col-span-2">
            <DesktopColumn title="Cities" links={CITIES} />
          </div>

          <div className="md:col-span-2 lg:col-span-1 lg:col-start-10">
            <DesktopColumn title="For organisers" links={FOR_ORGANISERS} />
          </div>

          <div className="md:col-span-3 md:col-start-1 md:row-start-2 lg:col-span-2 lg:col-start-11 lg:row-start-1">
            <DesktopColumn title="Company" links={COMPANY} />
          </div>
        </div>

        {/* Mobile - brand block + 5 accordions + language + social */}
        <div className="md:hidden">
          <EventlinqsLogo size="lg" variant="inverted" />
          <p className="mt-3 text-sm leading-6 text-white/70">
            The ticketing platform built for every culture.
          </p>

          <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
            <MobileAccordion title="Discover"        links={DISCOVER} />
            <MobileAccordion title="Cultures"        links={CULTURES} />
            <MobileAccordion title="Cities"          links={CITIES} />
            <MobileAccordion title="For organisers"  links={FOR_ORGANISERS} />
            <MobileAccordion title="Company"         links={COMPANY} />
          </div>

          <div className="mt-8">
            <LanguagePicker />
          </div>

          <div className="mt-8 flex justify-start">
            <SocialRow />
          </div>
        </div>
      </div>

      {/* Sub-footer: social row (desktop) + legal + trust + ABN + copyright */}
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

          {/* Desktop social row + legal */}
          <div className="hidden md:flex md:flex-wrap md:items-center md:justify-between md:gap-6">
            <SocialRow />
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {LEGAL.map(link => (
                <li key={link.href}>
                  <a href={link.href} className="text-xs text-white/70 transition-colors hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Mobile legal */}
          <ul className="md:hidden flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGAL.map(link => (
              <li key={link.href}>
                <a href={link.href} className="text-xs text-white/70 transition-colors hover:text-white">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          {/* Trust line */}
          <p className="mt-6 text-xs font-medium text-white/80">
            All-in pricing. No surprise fees.
          </p>

          {/* Markets line */}
          <p className="mt-2 text-xs text-white/60">
            AU, UK, US, EU. More cultures, more cities, soon.
          </p>

          {/* ABN + address + copyright */}
          <div className="mt-4 flex flex-col gap-1 text-xs text-white/50 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            <span>ABN 30 837 447 587</span>
            <span aria-hidden className="hidden sm:inline">·</span>
            <span>Registered Geelong VIC, Australia</span>
            <span aria-hidden className="hidden sm:inline">·</span>
            <a href="mailto:hello@eventlinqs.com" className="transition-colors hover:text-white/80">
              hello@eventlinqs.com
            </a>
            <span aria-hidden className="hidden sm:inline">·</span>
            <span>© {year} EventLinqs</span>
          </div>
        </div>
      </div>

    </footer>
  )
}
