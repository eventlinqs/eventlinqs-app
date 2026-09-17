import { Accessibility, Check, Phone } from 'lucide-react'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { hasAccessibilityInfo, type AccessibilityInfo } from '@/lib/accessibility/fields'

/**
 * THE ACCESSIBILITY SECTION, ON THE EVENT PAGE AND ON THE VENUE PAGE.
 *
 * Close-out SEO5 step 4. One component, two callers, so the two surfaces cannot
 * say the same thing in two different shapes and cannot disagree about when to
 * appear.
 *
 * ============================================================================
 * IT RETURNS NULL, AND THAT IS THE POINT RATHER THAN A DETAIL
 * ============================================================================
 *
 * "show it only when filled. A blank section is worse than none." An
 * Accessibility heading over an empty card does not read as "we have not been
 * told"; it reads as "there is none", to precisely the person who most needs
 * the answer and who is least able to shrug it off.
 *
 * So the emptiness decision lives HERE, in the component, exactly once, and no
 * caller re-derives it. `hasAccessibilityInfo` is the single test, and
 * `scripts/guards/no-false-urgency.mjs` fails the build if this component ever
 * loses its early return.
 *
 * ============================================================================
 * ONLY POSITIVES ARE RENDERED, EVER
 * ============================================================================
 *
 * `accessibilityItems` hands over the TRUE flags alone. There is no branch here
 * that renders "no hearing loop" or a crossed-out row, because a `false` in the
 * database means NOT STATED and rendering it as a negative would be the
 * platform making a claim no organiser made. The migration that creates the
 * columns says the same thing in SQL comments, so the rule survives somebody
 * reading only one of the two files.
 */
export function AccessibilitySection({
  info,
  /** What the reader is looking at, so the sentence beneath is honest about scope. */
  subject,
  eyebrow = 'Access',
}: {
  info: AccessibilityInfo
  subject: 'event' | 'venue'
  eyebrow?: string
}) {
  if (!hasAccessibilityInfo(info)) return null

  return (
    <section className="mt-10" aria-labelledby="accessibility-heading">
      <SectionHeader
        eyebrow={eyebrow}
        title="Accessibility"
        size="sm"
        id="accessibility-heading"
      />

      <div className="mt-5 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
        <p className="type-measure text-sm leading-relaxed text-ink-600">
          {subject === 'event'
            ? 'What the organiser has told us about access at this event.'
            : 'What this venue has told us about access.'}
        </p>

        {info.flags.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {info.flags.map(flag => (
              <li key={flag.column} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-1)] text-[var(--brand-accent-strong)]"
                >
                  <Check className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-900">{flag.label}</span>
                  <span className="block text-xs leading-relaxed text-ink-600">{flag.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {info.notes && (
          <p className="type-measure mt-5 whitespace-pre-line border-t border-ink-100 pt-5 text-sm leading-relaxed text-ink-700">
            {info.notes}
          </p>
        )}

        {info.contact && (
          <p className="mt-5 flex items-start gap-3 border-t border-ink-100 pt-5 text-sm text-ink-700">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-accent-strong)]" aria-hidden />
            <span>
              Questions about access:{' '}
              <span className="font-semibold text-ink-900">{info.contact}</span>
            </span>
          </p>
        )}

        <p className="mt-5 flex items-start gap-3 text-xs leading-relaxed text-ink-500">
          <Accessibility className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
          <span>
            Anything not listed here has not been told to us rather than ruled out. If you need
            something that is not mentioned, ask before you book.
          </span>
        </p>
      </div>
    </section>
  )
}
