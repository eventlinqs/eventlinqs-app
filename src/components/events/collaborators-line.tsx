import Link from 'next/link'
import type { JoinedCollaborator } from '@/lib/events/collaborators'

/** "A, B and C" in Australian English, its separators the language's own. */
const LIST = new Intl.ListFormat('en-AU', { style: 'long', type: 'conjunction' })

/**
 * The venues that joined an event (the locked plan of 27 October 2026, item 15:
 * "A collaborator shows on the page"), under its organiser: "With Beav's Bar",
 * each name linking to its own venue page. Nothing when none has joined.
 */
export function CollaboratorsLine({ collaborators, className = '' }: { collaborators: readonly JoinedCollaborator[]; className?: string }) {
  if (collaborators.length === 0) return null
  let next = 0
  const parts = LIST.formatToParts(collaborators.map((c) => c.name)).map((part, i) => {
    if (part.type === 'literal') return <span key={`s${i}`}>{part.value}</span>
    const c = collaborators[next++]
    return (
      <Link key={c.id} href={c.venuePath} className="font-semibold text-ink-900 hover:underline">
        {c.name}
      </Link>
    )
  })
  return (
    <p data-collaborators className={`m-0 text-sm text-ink-700 ${className}`}>
      With {parts}
    </p>
  )
}
