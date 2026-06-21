/**
 * First Nations flags - the paired Aboriginal and Torres Strait Islander flags
 * rendered at first position in the footer (per founder direction and
 * docs/M5-DESIGN-SPEC.md). Inline accessible SVG, not raw <img>, so no
 * MEDIA-ARCHITECTURE violation.
 *
 * These are the live exports extracted from the former community-calendar-widget
 * (whose placeholder CommunityCalendarWidget was dead and was removed). The hex
 * values below are the OFFICIAL flag specifications and are sovereign community
 * symbols: they are not brand tokens and must never be mapped to the palette.
 */

/**
 * Aboriginal Flag, designed by Harold Thomas, 1971.
 * The Commonwealth of Australia acquired the copyright in 2022; the flag
 * is free for general public use under the Commonwealth licence.
 *
 * Construction (per the flag specification):
 *   Upper half black (Aboriginal people), lower half red ochre (the earth),
 *   centred yellow disc (the sun, giver of life).
 */
function AboriginalFlag({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 40"
      role="img"
      aria-label="Aboriginal Flag, designed by Harold Thomas"
      className={className}
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
 * Paired flag block. Both flags equal size, side by side, with a small gap.
 */
function FirstNationsFlags({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <AboriginalFlag className="h-7 w-auto rounded-[2px] ring-1 ring-black/10" />
      <TorresStraitIslanderFlag className="h-7 w-auto rounded-[2px] ring-1 ring-black/10" />
    </span>
  )
}

export { AboriginalFlag, TorresStraitIslanderFlag, FirstNationsFlags }
