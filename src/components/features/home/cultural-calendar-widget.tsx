/**
 * Cultural Calendar widget - the EventLinqs design moat.
 *
 * Per docs/M5-DESIGN-SPEC.md / "What EventLinqs has that no competitor has":
 *   1. Cultural Calendar widget on homepage and embedded in event detail
 *   2. Sensitivity markers on event cards (icons + tooltip)
 *   3. Partnership badges ("In partnership with [community organisation]")
 *   4. Aboriginal and Torres Strait Islander Flag SVG in footer + first
 *      position in heritage filtering
 *
 * Section position (per founder direction 23 May 2026):
 *   Directly below the hero, above the first event rail.
 *
 * Both flags are rendered at equal visual size at first position. Both
 * carry attribution to their original designers in the accessibility
 * label. Inline SVG (not raw <img>) so no MEDIA-ARCHITECTURE violation.
 *
 * Cultural-content NOTE (for founder + community review):
 *   The NAIDOC Week framing, description copy, and partnership name in
 *   this file are PLACEHOLDERS. Theme strings for NAIDOC each year are
 *   set by the NAIDOC Committee; the 2026 theme had not been published
 *   as of this file's date (23 May 2026). Real content for any
 *   First Nations cultural moment must be sourced from community
 *   organisations directly, not from this file. Flagged in SUMMARY.md.
 */

import Link from 'next/link'
import { SECTION_DEFAULT, CONTAINER } from '@/lib/ui/spacing'

// ────────────────────────────────────────────────────────────────────────────
// Flag components (inline SVG, accessible, attributed)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Aboriginal Flag, designed by Harold Thomas, 1971.
 * The Commonwealth of Australia acquired the copyright in 2022; the flag
 * is free for general public use under the Commonwealth licence.
 *
 * Construction (per the flag specification):
 *   Upper half black (Aboriginal people), lower half red ochre (the earth),
 *   centred yellow disc (the sun, giver of life).
 *   Disc diameter is approximately half the flag's height; disc is centred
 *   on the horizontal midline so it bridges the black and red regions
 *   equally.
 */
function AboriginalFlag({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 40"
      role="img"
      aria-label="Aboriginal Flag, designed by Harold Thomas"
      className={className}
      // The flag is a sovereign cultural symbol; treat as decoration only
      // if a sibling element already announces it. Here we keep aria-label
      // because the widget header treats the pair as a content element.
    >
      <rect x="0" y="0"  width="60" height="20" fill="#000000" />
      <rect x="0" y="20" width="60" height="20" fill="#C72C30" />
      <circle cx="30" cy="20" r="9" fill="#FFCC00" />
      <title>Aboriginal Flag (Harold Thomas, 1971)</title>
    </svg>
  )
}

/**
 * Torres Strait Islander Flag, designed by Bernard Namok, 1992.
 * Adopted as an official flag of Australia in 1995. Used here with respect
 * to the Namok family who retain spiritual custodianship.
 *
 * Construction:
 *   Five horizontal bands - green (top and bottom), thin black, blue
 *   (middle). Centred white dhari (traditional headdress) with a five-
 *   pointed white star beneath.
 *   The blue represents the sea, green the land, black the people, white
 *   the spirit; the five-pointed star marks the five island groups.
 *
 * Layout note: the proportions below are simplified for SVG rendering
 * at small sizes. They preserve colour order and the centred dhari+star,
 * which are the identifying elements.
 */
function TorresStraitIslanderFlag({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 40"
      role="img"
      aria-label="Torres Strait Islander Flag, designed by Bernard Namok"
      className={className}
    >
      {/* Green top */}
      <rect x="0" y="0"  width="60" height="6"  fill="#06864F" />
      {/* Black */}
      <rect x="0" y="6"  width="60" height="2"  fill="#000000" />
      {/* Blue middle */}
      <rect x="0" y="8"  width="60" height="24" fill="#0072CE" />
      {/* Black */}
      <rect x="0" y="32" width="60" height="2"  fill="#000000" />
      {/* Green bottom */}
      <rect x="0" y="34" width="60" height="6"  fill="#06864F" />
      {/* Dhari (headdress): simplified crown-of-feathers shape, white */}
      <path
        d="M22 22 L24 16 L26 22 L28 14 L30 22 L32 14 L34 22 L36 16 L38 22 Z"
        fill="#FFFFFF"
      />
      {/* Five-pointed white star beneath the dhari */}
      <polygon
        points="30,23 31.2,26.5 35,26.5 31.9,28.7 33.1,32.2 30,30 26.9,32.2 28.1,28.7 25,26.5 28.8,26.5"
        fill="#FFFFFF"
      />
      <title>Torres Strait Islander Flag (Bernard Namok, 1992)</title>
    </svg>
  )
}

/**
 * Paired flag block. Both flags equal size, side by side, with a small
 * gap. Used at the first position of the widget header.
 */
function FirstNationsFlags({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <AboriginalFlag className="h-7 w-auto rounded-[2px] ring-1 ring-black/10" />
      <TorresStraitIslanderFlag className="h-7 w-auto rounded-[2px] ring-1 ring-black/10" />
    </span>
  )
}

// Public re-exports for the footer (per spec; the footer renders the same
// pair at first position permanently).
export { AboriginalFlag, TorresStraitIslanderFlag, FirstNationsFlags }

// ────────────────────────────────────────────────────────────────────────────
// Sensitivity markers
// ────────────────────────────────────────────────────────────────────────────

type SensitivityMarker =
  | 'first-nations-led'
  | 'age-21-plus'
  | 'wheelchair-accessible'
  | 'auslan-interpreted'
  | 'sensory-friendly'
  | 'culturally-safe'

const MARKER_LABEL: Record<SensitivityMarker, string> = {
  'first-nations-led':     'Aboriginal and Torres Strait Islander led',
  'age-21-plus':           '21+ event',
  'wheelchair-accessible': 'Wheelchair accessible',
  'auslan-interpreted':    'Auslan interpreted',
  'sensory-friendly':      'Sensory-friendly',
  'culturally-safe':       'Community-safe space',
}

function MarkerIcon({ marker }: { marker: SensitivityMarker }) {
  // Small, monoline SVGs. currentColor so the parent controls hue.
  switch (marker) {
    case 'first-nations-led':
      return <FirstNationsFlags className="h-4 w-auto" />
    case 'age-21-plus':
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <text x="8" y="11" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="currentColor" fontFamily="inherit">21+</text>
        </svg>
      )
    case 'wheelchair-accessible':
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <circle cx="6" cy="3" r="1.4" />
          <path d="M5.2 5.2 L5.6 8.4 L8.6 8.4 L9.8 12 L11.6 11.2 L11.2 10 L10 10.4 L9.2 8 C9 7.4 8.6 7 8 7 L6.6 7 L6.4 5.6 Z" />
          <circle cx="6.4" cy="11.2" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      )
    case 'auslan-interpreted':
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M8 1.5 C5.5 1.5 4 3 4 5 L4 8 L3 8 C2.4 8 2 8.4 2 9 L2 10 C2 11 2.6 12 4 12.4 L4 14 L6 14 L6 12.6 L10 12.6 L10 14 L12 14 L12 12.4 C13.4 12 14 11 14 10 L14 9 C14 8.4 13.6 8 13 8 L12 8 L12 5 C12 3 10.5 1.5 8 1.5 Z M6 5 C6 4 7 3.4 8 3.4 C9 3.4 10 4 10 5 L10 8 L6 8 Z" />
        </svg>
      )
    case 'sensory-friendly':
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
          <path d="M3 8 C3 5 5 3 8 3 C11 3 13 5 13 8 C13 11 11 13 8 13" />
          <path d="M5.5 8 C5.5 6.5 6.5 5.5 8 5.5" />
          <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'culturally-safe':
      return (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
          <path d="M8 1.5 L13 4 L13 9 C13 11.5 11 13.5 8 14.5 C5 13.5 3 11.5 3 9 L3 4 Z" />
          <path d="M6 8.5 L7.5 10 L10.5 6.5" />
        </svg>
      )
  }
}

function SensitivityMarkerBadge({ marker }: { marker: SensitivityMarker }) {
  const label = MARKER_LABEL[marker]
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-[var(--color-ink-200)] bg-[var(--surface-0)] px-3 py-1.5 text-[var(--text-primary)]"
      style={{ fontSize: 'var(--type-small)', fontWeight: 500, transition: 'border-color var(--motion-quick), background-color var(--motion-quick)' }}
      // The native title attribute provides the tooltip without
      // additional JS or a portal. Screen readers also surface it as a
      // supplementary description after the visible label.
      title={label}
    >
      <span className="text-[var(--text-secondary)]" aria-hidden="true">
        <MarkerIcon marker={marker} />
      </span>
      <span>{label}</span>
    </span>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Partnership badge slot
// ────────────────────────────────────────────────────────────────────────────

type Partnership = {
  name: string
  url?: string
}

function PartnershipBadge({ partnership }: { partnership: Partnership | null }) {
  if (!partnership) {
    return null
  }
  const inner = (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/10 px-3 py-1.5 text-[var(--text-primary)]"
      style={{ fontSize: 'var(--type-small)', fontWeight: 600 }}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-[var(--brand-accent-strong)]" fill="currentColor" aria-hidden="true">
        <path d="M8 1 L10 6 L15 6 L11 9 L13 14 L8 11 L3 14 L5 9 L1 6 L6 6 Z" />
      </svg>
      <span>
        In partnership with <strong className="font-semibold">{partnership.name}</strong>
      </span>
    </span>
  )
  return partnership.url ? (
    <Link href={partnership.url} className="no-underline">
      {inner}
    </Link>
  ) : (
    inner
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Widget
// ────────────────────────────────────────────────────────────────────────────

/**
 * Props are intentionally minimal. The cultural moment is sourced from
 * a constant for now (placeholder for community-review content); when a
 * proper cultural-calendar data source is built (see follow-up in
 * SUMMARY.md), this becomes a server-fetched value.
 */
export type CulturalMoment = {
  /** Display title, e.g. "NAIDOC Week" */
  title: string
  /** Date range as plain text, AU format e.g. "5 to 12 July 2026" */
  dateRange: string
  /** One-paragraph description, plain text */
  description: string
  /** Optional partnership for this moment */
  partnership: Partnership | null
  /** Sensitivity markers that apply to this section's events */
  markers: SensitivityMarker[]
  /** CTA destination - usually a filter URL */
  ctaHref: string
  /** CTA label */
  ctaLabel: string
}

/**
 * PLACEHOLDER content - replace with community-sourced copy before launch.
 * NAIDOC Week 2026 dates per the standard first-full-week-of-July rule.
 * Theme is intentionally generic; the NAIDOC Committee sets the official
 * theme each year and that source is the only one we should ship with.
 */
const PLACEHOLDER_MOMENT: CulturalMoment = {
  title: 'NAIDOC Week',
  dateRange: '5 to 12 July 2026',
  description:
    'A week to recognise and celebrate the history, culture, and achievements of Aboriginal and Torres Strait Islander peoples. Theme and detail copy on this card is placeholder pending community-sourced content.',
  partnership: null, // Filled when an actual partner organisation is confirmed
  markers: [
    'first-nations-led',
    'culturally-safe',
    'wheelchair-accessible',
    'auslan-interpreted',
  ],
  ctaHref: '/heritage/aboriginal-torres-strait-islander',
  ctaLabel: 'See events for this moment',
}

export function CulturalCalendarWidget({
  moment = PLACEHOLDER_MOMENT,
}: {
  moment?: CulturalMoment
}) {
  return (
    <section
      aria-labelledby="cultural-calendar-heading"
      className={`bg-[var(--surface-1)] ${SECTION_DEFAULT}`}
    >
      <div className={CONTAINER}>
        {/* Header row: flags at first position, then eyebrow + title */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <FirstNationsFlags />
            <div>
              <p
                className="uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]"
                style={{ fontSize: 'var(--type-micro)', fontWeight: 600 }}
              >
                Community Calendar
              </p>
              <h2
                id="cultural-calendar-heading"
                className="type-h2 mt-1 text-[var(--text-primary)]"
              >
                {moment.title}
              </h2>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <time
              className="text-[var(--text-secondary)]"
              style={{ fontSize: 'var(--type-small)', fontWeight: 600 }}
            >
              {moment.dateRange}
            </time>
            <PartnershipBadge partnership={moment.partnership} />
          </div>
        </div>

        {/* Description */}
        <p
          className="mt-6 max-w-3xl text-[var(--text-secondary)] type-body"
        >
          {moment.description}
        </p>

        {/* Sensitivity markers row */}
        {moment.markers.length > 0 && (
          <div className="mt-6">
            <p
              className="uppercase tracking-wider text-[var(--text-secondary)]"
              style={{ fontSize: 'var(--type-micro)', fontWeight: 600 }}
            >
              What this section supports
            </p>
            <ul
              className="mt-3 flex flex-wrap"
              style={{ gap: 'var(--space-tight-gap)' }}
            >
              {moment.markers.map(m => (
                <li key={m}>
                  <SensitivityMarkerBadge marker={m} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA */}
        <div className="mt-8 flex items-center gap-3">
          <Link
            href={moment.ctaHref}
            className="inline-flex items-center rounded-lg bg-[var(--surface-dark)] px-5 py-2.5 text-[var(--text-on-dark)]"
            style={{
              fontSize: 'var(--type-small)',
              fontWeight: 600,
              transition: 'background-color var(--motion-quick), transform var(--motion-quick)',
            }}
          >
            {moment.ctaLabel}
            <svg viewBox="0 0 16 16" className="ml-2 h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
              <path d="M3 8 L11 8 M8 5 L11 8 L8 11" stroke="currentColor" strokeWidth="1.4" fill="none" />
            </svg>
          </Link>
          <span
            className="text-[var(--text-secondary)]"
            style={{ fontSize: 'var(--type-micro)' }}
          >
            Placeholder content for founder and community review
          </span>
        </div>
      </div>
    </section>
  )
}
