import { LOCKED_SET, OURS, REFERENCES } from '@/lib/social/swipe/library'
import { Panel } from '@/components/admin/ui/admin-kit'
import { dayDate } from '@/lib/dates/admin-dates'

/**
 * THE SWIPE LIBRARY, READ ONLY (EL-M2, the PM's 01:30 of 16 November 2026): our own 22 locked posts with why each works,
 * and the leaders' posts we take from, each with its link, the day it was looked at, what it does and what we take. Data
 * from src/lib/social/swipe/library.ts; nothing here is pressed or changed.
 */
export function SwipeLibraryPanel() {
  return (
    <div data-section="swipe-library" className="mt-8">
      <Panel title="The swipe library" count={OURS.length + REFERENCES.length}>
        <p className="text-sm text-white/70">What a post is measured against: our own locked 22 and the leaders&apos; best, read only.</p>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-white/60">The leaders, this week</h3>
        <ul className="mt-2 divide-y divide-white/[0.06]">
          {REFERENCES.map((r) => (
            <li key={r.link} data-reference={r.leader} className="py-3">
              <a href={r.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline-offset-2 hover:underline">
                {r.leader}: {r.title}
              </a>
              <p className="mt-1 text-xs text-white/55">Looked at {dayDate(r.seen)}</p>
              <p className="mt-1 text-sm text-white/70">{r.does}</p>
              <p className="mt-1 text-sm text-white/85">What we take: {r.take}</p>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-white/60">Ours, the locked 22</h3>
        <p className="mt-1 text-xs text-white/55">Each in its folder in {LOCKED_SET}</p>
        <ol className="mt-2 divide-y divide-white/[0.06]">
          {OURS.map((p) => (
            <li key={p.folder} data-ours={p.n} className="py-2.5">
              <p className="text-sm font-semibold text-white">
                {p.n}. {p.family}, {p.where}
              </p>
              <p className="mt-0.5 break-words text-xs text-white/55">{p.folder}</p>
              <p className="mt-1 text-sm text-white/70">{p.why}</p>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}
