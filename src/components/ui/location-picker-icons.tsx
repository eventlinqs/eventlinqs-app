/**
 * The one icon both halves of the location picker need.
 *
 * `location-picker.tsx` paints it in the trigger, which is on every route;
 * `location-picker-panel.tsx` paints it in the dialog heading, which is fetched
 * on interaction. A leaf module with no imports keeps the shared glyph in the
 * platform-wide shell at its own size (a path and a circle) instead of pulling
 * the dialog back in behind it, which is what a re-export from the panel would
 * have done.
 *
 * The panel's other three glyphs (search, close, crosshair) are NOT here, on
 * purpose: nothing outside the dialog draws them, so they belong in the dialog's
 * chunk.
 */
export function MapPinIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <circle cx="12" cy="11" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
