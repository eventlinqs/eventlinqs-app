'use client'

import { useEffect, useRef, useState } from 'react'

type Kind = 'organisation' | 'event'
interface Result {
  id: string
  label: string
  sub: string
}

/**
 * Searchable organisation / event picker for the pricing-override form.
 * Replaces the raw-UUID input: pick a scope, type a name, choose the target.
 * Emits two hidden inputs the server action already reads: `scopeKind` and
 * `targetId`. No target selected -> targetId stays empty and the action's
 * UUID validation rejects it, so a fat-fingered search cannot mis-target.
 */
export function OverrideTargetPicker() {
  const [kind, setKind] = useState<Kind>('organisation')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [selected, setSelected] = useState<Result | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounced search whenever the query or scope changes.
  useEffect(() => {
    if (selected && query === selected.label) return
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/admin/pricing/targets?kind=${kind}&q=${encodeURIComponent(query)}`)
        const json = await res.json()
        if (!cancelled) {
          setResults(Array.isArray(json.results) ? json.results : [])
          setOpen(true)
        }
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, kind, selected])

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function choose(r: Result) {
    setSelected(r)
    setQuery(r.label)
    setOpen(false)
  }

  function changeKind(next: Kind) {
    setKind(next)
    setSelected(null)
    setQuery('')
    setResults([])
  }

  const labelForKind = kind === 'organisation' ? 'organisation' : 'event'

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-3">
      <input type="hidden" name="scopeKind" value={kind} />
      <input type="hidden" name="targetId" value={selected?.id ?? ''} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ov-scope" className="text-[11px] uppercase tracking-wider text-white/50">Scope</label>
        <select
          id="ov-scope"
          value={kind}
          onChange={(e) => changeKind(e.target.value as Kind)}
          className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none"
        >
          <option value="organisation">Organisation</option>
          <option value="event">Event</option>
        </select>
      </div>

      <div ref={boxRef} className="relative flex flex-col gap-1.5">
        <label htmlFor="ov-search" className="text-[11px] uppercase tracking-wider text-white/50">
          Find {labelForKind}
        </label>
        <input
          id="ov-search"
          type="text"
          autoComplete="off"
          value={query}
          placeholder={`Type an ${labelForKind} name`}
          onChange={(e) => {
            setQuery(e.target.value)
            if (selected) setSelected(null)
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none"
        />
        {open && (results.length > 0 || loading) && (
          <ul className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-white/15 bg-[#0F1626] shadow-xl">
            {loading && <li className="px-3 py-2 text-sm text-white/40">Searching...</li>}
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => choose(r)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-white/[0.06]"
                >
                  <span className="text-sm text-white">{r.label}</span>
                  <span className="font-mono text-[11px] text-white/40">{r.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected ? (
          <p className="text-[11px] text-emerald-300/80">Selected: {selected.label}</p>
        ) : (
          <p className="text-[11px] text-white/40">Pick a {labelForKind} from the list.</p>
        )}
      </div>
    </div>
  )
}
