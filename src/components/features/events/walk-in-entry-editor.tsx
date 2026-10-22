'use client'

import { Plus, Trash2 } from 'lucide-react'
import type { Guide } from '@/lib/walk-in/guide'

/**
 * THE WALK-IN GUIDE, AS THE ORGANISER FILLS IT IN (WI1-ITEM.md point 1).
 *
 * "The organiser sets the hours for each day. ... Optional: a day-by-day
 * program, where each day has items (a time label and text) and a 'closing the
 * night' act. Optional: highlights ('all days') and access notes."
 * Plus the fields locked design A draws beyond those: at a glance, the quote,
 * getting there, the photos heading and the two photo credits.
 *
 * The days on offer are the dates of the event from step 2, in its own zone.
 * The organiser keeps the ones the event is open on: a bar night from 9pm to
 * 2am spans two dates and is one night, which a calendar cannot know.
 *
 * The server parses all of it again (src/lib/walk-in/guide.ts) before it is
 * stored, so nothing here is trusted; this only makes it easy to fill in.
 */

export type WalkInDayForm = {
  date: string
  include: boolean
  opens: string
  toConfirm: boolean
  hoursLabel: string
  closes: string
  items: Array<{ when: string; what: string }>
  closerName: string
  closerNote: string
}

export type WalkInFormState = {
  days: WalkInDayForm[]
  at_a_glance: Array<{ value: string; label: string }>
  highlights: Array<{ title: string; body: string }>
  highlights_note: string
  program_note: string
  quote_text: string
  quote_attribution: string
  getting_there: string
  access_notes: string
  photos_heading: string
  cover_credit: string
  photo_credit: string
}

export const EMPTY_WALK_IN_FORM: WalkInFormState = {
  days: [],
  at_a_glance: [],
  highlights: [],
  highlights_note: '',
  program_note: '',
  quote_text: '',
  quote_attribution: '',
  getting_there: '',
  access_notes: '',
  photos_heading: '',
  cover_credit: '',
  photo_credit: '',
}

/** A stored guide, as the form holds it. */
export function walkInFormFromGuide(guide: Guide | null): WalkInFormState {
  if (!guide) return EMPTY_WALK_IN_FORM
  return {
    days: guide.days.map((d) => ({
      date: d.date,
      include: true,
      opens: d.opens ?? '',
      toConfirm: d.opens === null,
      hoursLabel: d.hours_label ?? '',
      // A day with no finish (an EventLinqs listing a host has claimed) opens
      // blank, and the form asks for one as it does for every organiser.
      closes: d.closes ?? '',
      items: d.items.map((i) => ({ when: i.when, what: i.what })),
      closerName: d.closer?.name ?? '',
      closerNote: d.closer?.note ?? '',
    })),
    at_a_glance: guide.at_a_glance.map((g) => ({ ...g })),
    highlights: guide.highlights.map((h) => ({ ...h })),
    highlights_note: guide.highlights_note ?? '',
    program_note: guide.program_note ?? '',
    quote_text: guide.quote_text ?? '',
    quote_attribution: guide.quote_attribution ?? '',
    getting_there: guide.getting_there ?? '',
    access_notes: guide.access_notes ?? '',
    photos_heading: guide.photos_heading ?? '',
    cover_credit: guide.cover_credit ?? '',
    photo_credit: guide.photo_credit ?? '',
  }
}

/** Fold the dates of the event into the form, keeping what was typed for a date already there. */
export function syncWalkInDays(state: WalkInFormState, dates: string[]): WalkInFormState {
  const byDate = new Map(state.days.map((d) => [d.date, d]))
  return {
    ...state,
    days: dates.map(
      (date) =>
        byDate.get(date) ?? {
          date,
          include: true,
          opens: '',
          toConfirm: false,
          hoursLabel: '',
          closes: '',
          items: [],
          closerName: '',
          closerNote: '',
        },
    ),
  }
}

const trimOrNull = (s: string) => (s.trim() ? s.trim() : null)

/** The form, as the guide the server parses. Blank rows are dropped, never stored. */
export function walkInGuidePayload(state: WalkInFormState): Record<string, unknown> {
  return {
    days: state.days
      .filter((d) => d.include)
      .map((d) => ({
        date: d.date,
        opens: d.toConfirm || !d.opens ? null : d.opens,
        hours_label: d.toConfirm || !d.opens ? trimOrNull(d.hoursLabel) : null,
        closes: d.closes,
        items: d.items.filter((i) => i.when.trim() && i.what.trim()),
        closer: d.closerName.trim() ? { name: d.closerName.trim(), note: trimOrNull(d.closerNote) } : null,
      })),
    at_a_glance: state.at_a_glance.filter((g) => g.value.trim() && g.label.trim()),
    highlights: state.highlights.filter((h) => h.title.trim() && h.body.trim()),
    highlights_note: trimOrNull(state.highlights_note),
    program_note: trimOrNull(state.program_note),
    quote_text: trimOrNull(state.quote_text),
    quote_attribution: trimOrNull(state.quote_attribution),
    getting_there: trimOrNull(state.getting_there),
    access_notes: trimOrNull(state.access_notes),
    photos_heading: trimOrNull(state.photos_heading),
    cover_credit: trimOrNull(state.cover_credit),
    photo_credit: trimOrNull(state.photo_credit),
  }
}

const field =
  'min-h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus-visible:border-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]'
const label = 'mb-1 block text-sm font-semibold text-ink-900'
const ghost =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-900 hover:border-ink-900'

/**
 * A guide day is a ZONE-LESS calendar date ("2026-10-24"): the day of the event
 * in its own zone, already worked out from the event's dates (src/lib/walk-in/
 * dates.ts), not an instant. Built at noon UTC and formatted as UTC, its name is
 * the same date on every machine; formatted in a reader's zone it could not be.
 */
const CALENDAR_DATE_ZONE = 'UTC'

function dayName(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: CALENDAR_DATE_ZONE }).format(
    new Date(`${iso}T12:00:00Z`),
  )
}

export function WalkInEntryEditor({
  value,
  onChange,
}: {
  value: WalkInFormState
  onChange: (next: WalkInFormState) => void
}) {
  const setDay = (i: number, patch: Partial<WalkInDayForm>) =>
    onChange({ ...value, days: value.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) })
  const set = <K extends keyof WalkInFormState>(key: K, v: WalkInFormState[K]) => onChange({ ...value, [key]: v })

  return (
    <div className="space-y-8" id="entry">
      <section>
        <h3 className="font-display text-base font-bold text-ink-900">Hours for each day</h3>
        <p className="mt-1 text-sm text-ink-600">
          The days come from your dates in step 2. Untick a day the event is not open on, such as the small hours after a late night.
        </p>
        {value.days.length === 0 && (
          <p className="mt-3 text-sm font-semibold text-ink-900">Set the start and end in step 2 first.</p>
        )}
        <ul className="mt-4 space-y-4">
          {value.days.map((d, i) => (
            <li key={d.date} className="rounded-xl border border-ink-100 bg-white p-4">
              <label className="flex items-center gap-2 text-sm font-bold text-ink-900">
                <input type="checkbox" className="h-5 w-5" checked={d.include} onChange={(e) => setDay(i, { include: e.target.checked })} />
                {dayName(d.date)}
              </label>
              {d.include && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={label} htmlFor={`opens-${d.date}`}>Opens</label>
                      <input id={`opens-${d.date}`} type="time" className={field} value={d.opens} disabled={d.toConfirm} onChange={(e) => setDay(i, { opens: e.target.value })} />
                    </div>
                    <div>
                      <label className={label} htmlFor={`closes-${d.date}`}>Closes</label>
                      <input id={`closes-${d.date}`} type="time" className={field} value={d.closes} onChange={(e) => setDay(i, { closes: e.target.value })} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-ink-900">
                    <input type="checkbox" className="h-5 w-5" checked={d.toConfirm} onChange={(e) => setDay(i, { toConfirm: e.target.checked })} />
                    The opening time is still to be confirmed
                  </label>
                  {d.toConfirm && (
                    <div>
                      <label className={label} htmlFor={`label-${d.date}`}>What to show instead</label>
                      <input id={`label-${d.date}`} className={field} maxLength={60} placeholder="10am or 11am, to confirm" value={d.hoursLabel} onChange={(e) => setDay(i, { hoursLabel: e.target.value })} />
                    </div>
                  )}

                  <div>
                    <p className={label}>Program for this day (optional)</p>
                    <ul className="space-y-2">
                      {d.items.map((item, k) => (
                        <li key={k} className="grid grid-cols-[8rem_minmax(0,1fr)_auto] gap-2">
                          <input aria-label="Time" className={field} maxLength={40} placeholder="9pm" value={item.when} onChange={(e) => setDay(i, { items: d.items.map((x, n) => (n === k ? { ...x, when: e.target.value } : x)) })} />
                          <input aria-label="What happens" className={field} maxLength={200} placeholder="Live set on the main stage" value={item.what} onChange={(e) => setDay(i, { items: d.items.map((x, n) => (n === k ? { ...x, what: e.target.value } : x)) })} />
                          <button type="button" aria-label="Remove this item" className={ghost} onClick={() => setDay(i, { items: d.items.filter((_, n) => n !== k) })}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {d.items.length < 20 && (
                      <button type="button" className={`${ghost} mt-2`} onClick={() => setDay(i, { items: [...d.items, { when: '', what: '' }] })}>
                        <Plus className="h-4 w-4" aria-hidden /> Add an item
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={label} htmlFor={`closer-${d.date}`}>Closing the night (optional)</label>
                      <input id={`closer-${d.date}`} className={field} maxLength={80} value={d.closerName} onChange={(e) => setDay(i, { closerName: e.target.value })} />
                    </div>
                    <div>
                      <label className={label} htmlFor={`closer-note-${d.date}`}>A line about them</label>
                      <input id={`closer-note-${d.date}`} className={field} maxLength={120} value={d.closerNote} onChange={(e) => setDay(i, { closerNote: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <label className={label} htmlFor="program-note">A note under the program (optional)</label>
          <textarea id="program-note" className={`${field} min-h-20 py-2`} maxLength={600} placeholder="The full timetable is still to come." value={value.program_note} onChange={(e) => set('program_note', e.target.value)} />
        </div>
      </section>

      <section>
        <h3 className="font-display text-base font-bold text-ink-900">At a glance (optional, up to four)</h3>
        <ul className="mt-3 space-y-2">
          {value.at_a_glance.map((g, i) => (
            <li key={i} className="grid grid-cols-[8rem_minmax(0,1fr)_auto] gap-2">
              <input aria-label="Figure" className={field} maxLength={24} placeholder="13th" value={g.value} onChange={(e) => set('at_a_glance', value.at_a_glance.map((x, n) => (n === i ? { ...x, value: e.target.value } : x)))} />
              <input aria-label="What it means" className={field} maxLength={60} placeholder="year at Fed Square" value={g.label} onChange={(e) => set('at_a_glance', value.at_a_glance.map((x, n) => (n === i ? { ...x, label: e.target.value } : x)))} />
              <button type="button" aria-label="Remove this figure" className={ghost} onClick={() => set('at_a_glance', value.at_a_glance.filter((_, n) => n !== i))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {value.at_a_glance.length < 4 && (
          <button type="button" className={`${ghost} mt-2`} onClick={() => set('at_a_glance', [...value.at_a_glance, { value: '', label: '' }])}>
            <Plus className="h-4 w-4" aria-hidden /> Add a figure
          </button>
        )}
      </section>

      <section>
        <h3 className="font-display text-base font-bold text-ink-900">Highlights (optional, up to six)</h3>
        <ul className="mt-3 space-y-3">
          {value.highlights.map((h, i) => (
            <li key={i} className="space-y-2 rounded-xl border border-ink-100 bg-white p-3">
              <input aria-label="Highlight title" className={field} maxLength={60} placeholder="Food from across Africa" value={h.title} onChange={(e) => set('highlights', value.highlights.map((x, n) => (n === i ? { ...x, title: e.target.value } : x)))} />
              <textarea aria-label="Highlight detail" className={`${field} min-h-16 py-2`} maxLength={300} value={h.body} onChange={(e) => set('highlights', value.highlights.map((x, n) => (n === i ? { ...x, body: e.target.value } : x)))} />
              <button type="button" className={ghost} onClick={() => set('highlights', value.highlights.filter((_, n) => n !== i))}>
                <Trash2 className="h-4 w-4" aria-hidden /> Remove
              </button>
            </li>
          ))}
        </ul>
        {value.highlights.length < 6 && (
          <button type="button" className={`${ghost} mt-2`} onClick={() => set('highlights', [...value.highlights, { title: '', body: '' }])}>
            <Plus className="h-4 w-4" aria-hidden /> Add a highlight
          </button>
        )}
        <div className="mt-3">
          <label className={label} htmlFor="highlights-note">A line under the highlights (optional)</label>
          <textarea id="highlights-note" className={`${field} min-h-16 py-2`} maxLength={600} value={value.highlights_note} onChange={(e) => set('highlights_note', e.target.value)} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="quote-text">A quote (optional)</label>
          <textarea id="quote-text" className={`${field} min-h-16 py-2`} maxLength={600} value={value.quote_text} onChange={(e) => set('quote_text', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="quote-by">Who said it</label>
          <input id="quote-by" className={field} maxLength={120} value={value.quote_attribution} onChange={(e) => set('quote_attribution', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="getting-there">Getting there (optional)</label>
          <textarea id="getting-there" className={`${field} min-h-16 py-2`} maxLength={800} placeholder="Trams, trains, parking, the entrance to use" value={value.getting_there} onChange={(e) => set('getting_there', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="access-notes">Access (optional)</label>
          <textarea id="access-notes" className={`${field} min-h-16 py-2`} maxLength={800} placeholder="Step-free entry, accessible toilets, hearing loops" value={value.access_notes} onChange={(e) => set('access_notes', e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="photos-heading">Heading over your photos (optional)</label>
          <input id="photos-heading" className={field} maxLength={60} placeholder="From past festivals" value={value.photos_heading} onChange={(e) => set('photos_heading', e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="cover-credit">Credit for the cover photo (optional)</label>
          <input id="cover-credit" className={field} maxLength={120} value={value.cover_credit} onChange={(e) => set('cover_credit', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="photo-credit">Credit for your other photos (optional)</label>
          <input id="photo-credit" className={field} maxLength={120} value={value.photo_credit} onChange={(e) => set('photo_credit', e.target.value)} />
        </div>
      </section>
    </div>
  )
}
