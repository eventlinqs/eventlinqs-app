/**
 * OPENSTREETMAP'S CREDIT, UNDER EVERY MAP THAT PLACES A VENUE BY ITS STORED
 * COORDINATES (WI2 Part 3, first slice). The city guide's hosts were placed on
 * 27 October 2026 by OpenStreetMap's Nominatim, whose policy asks to "Clearly
 * display attribution as suitable for your medium"
 * (https://operations.osmfoundation.org/policies/nominatim/), and OpenStreetMap
 * asks to "Make clear that the data is available under the Open Database
 * License" (https://www.openstreetmap.org/copyright, both read 27 October 2026).
 * One line, one source, beside the map it credits.
 */
export function OsmAttribution({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-snug text-ink-600 ${className}`}>
      Some venue locations ©{' '}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer noopener"
        className="underline hover:text-ink-900"
      >
        OpenStreetMap contributors
      </a>
      , available under the Open Database License.
    </p>
  )
}
