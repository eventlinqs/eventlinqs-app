'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { importSeatMapCsv, deleteSeatMap, type ImportResult } from './actions'

interface SeatMap {
  id: string
  name: string
  total_seats: number
  created_at: string
}

interface Props {
  venueId: string
  venueName: string
  seatMaps: SeatMap[]
}

interface LayoutSeat {
  number: string
  type: string
  x: number
  y: number
}

interface LayoutRow {
  label: string
  seats: LayoutSeat[]
}

interface LayoutSection {
  id: string
  name: string
  color: string
  sort_order: number
  rows: LayoutRow[]
}

interface Layout {
  sections: LayoutSection[]
}

function SeatMapPreview({ layout }: { layout: Layout }) {
  // Find bounding box for the SVG viewport
  const allSeats = layout.sections.flatMap(s =>
    s.rows.flatMap(r => r.seats.map(seat => ({ ...seat, color: s.color })))
  )

  if (allSeats.length === 0) return null

  const minX = Math.min(...allSeats.map(s => s.x))
  const maxX = Math.max(...allSeats.map(s => s.x))
  const minY = Math.min(...allSeats.map(s => s.y))
  const maxY = Math.max(...allSeats.map(s => s.y))

  const padding = 20
  const seatSize = 18
  const viewWidth = maxX - minX + seatSize + padding * 2
  const viewHeight = maxY - minY + seatSize + padding * 2

  return (
    <div className="mt-4 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-medium text-gray-500 mb-3">Seat map preview ({allSeats.length} seats)</p>
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        style={{ width: '100%', maxHeight: '400px' }}
        className="overflow-visible"
      >
        {layout.sections.flatMap(section =>
          section.rows.flatMap(row =>
            row.seats.map((seat, i) => {
              const cx = seat.x - minX + padding + seatSize / 2
              const cy = seat.y - minY + padding + seatSize / 2
              return (
                <g key={`${section.name}-${row.label}-${seat.number}-${i}`}>
                  <rect
                    x={cx - seatSize / 2}
                    y={cy - seatSize / 2}
                    width={seatSize}
                    height={seatSize}
                    rx="3"
                    fill={section.color}
                    fillOpacity={seat.type === 'accessible' ? 1 : 0.85}
                    stroke={seat.type === 'accessible' ? '#fff' : 'none'}
                    strokeWidth="1.5"
                  />
                  <text
                    x={cx}
                    y={cy + 4}
                    textAnchor="middle"
                    fontSize="8"
                    fill="white"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    {seat.number}
                  </text>
                </g>
              )
            })
          )
        )}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3">
        {layout.sections.map(s => (
          <div key={s.id} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-xs text-gray-600">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SeatMapsClient({ venueId, venueName, seatMaps: initialMaps }: Props) {
  const router = useRouter()
  const [seatMaps, setSeatMaps] = useState<SeatMap[]>(initialMaps)
  const [showImport, setShowImport] = useState(false)
  const [mapName, setMapName] = useState('')
  const [csvText, setCsvText] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCsvText(ev.target?.result as string ?? '')
    reader.readAsText(file)
  }

  function handleImport() {
    if (!csvText.trim()) return
    setImportResult(null)
    startTransition(async () => {
      const result = await importSeatMapCsv(venueId, mapName, csvText)
      setImportResult(result)
      if (result.success && result.seat_map_id) {
        setSeatMaps(prev => [
          {
            id: result.seat_map_id!,
            name: mapName || 'Seat Map',
            total_seats: result.seat_count ?? 0,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ])
        router.refresh()
        // Keep the preview visible; let user close manually
      }
    })
  }

  function handleDelete(seatMapId: string) {
    startTransition(async () => {
      const result = await deleteSeatMap(venueId, seatMapId)
      if (!result.error) {
        setSeatMaps(prev => prev.filter(m => m.id !== seatMapId))
        setDeletingId(null)
        router.refresh()
      }
    })
  }

  const csvTemplate = 'section,row,seat_number,seat_type,x,y\nOrchestra,A,1,standard,100,600\nOrchestra,A,2,standard,130,600\nOrchestra,A,3,accessible,160,600\nMezzanine,B,1,premium,100,400'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Seat Maps</h1>
          <p className="mt-1 text-sm text-gray-500">{venueName}</p>
        </div>
        {!showImport && (
          <button
            type="button"
            onClick={() => { setShowImport(true); setImportResult(null) }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Import CSV
          </button>
        )}
      </div>

      {showImport && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Import Seat Map from CSV</h2>
            <button
              type="button"
              onClick={() => { setShowImport(false); setImportResult(null); setCsvText('') }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          <div className="rounded-lg bg-blue-50 px-4 py-3 text-xs text-blue-800">
            <p className="font-medium mb-1">Required CSV columns (in any order):</p>
            <code className="font-mono">section, row, seat_number, seat_type, x, y</code>
            <p className="mt-1">seat_type values: standard, premium, accessible, companion, restricted_view, obstructed</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Map Name</label>
            <input
              type="text"
              value={mapName}
              onChange={e => setMapName(e.target.value)}
              placeholder="e.g. Main Hall — Theatre Config"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">CSV File or Paste</label>
              <button
                type="button"
                onClick={() => setCsvText(csvTemplate)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Load example
              </button>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="mb-2 text-sm text-gray-600"
            />
            <textarea
              rows={8}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder="Or paste CSV content here…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {importResult && !importResult.success && (
            <div className="rounded-lg bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-700 mb-1">Import failed</p>
              <pre className="text-xs text-red-600 whitespace-pre-wrap">{importResult.error}</pre>
            </div>
          )}

          {importResult?.success && importResult.layout && (
            <div className="rounded-lg bg-green-50 px-4 py-3">
              <p className="text-sm font-medium text-green-700">
                Import successful — {importResult.seat_count} seats across{' '}
                {importResult.layout.sections.length} section(s)
              </p>
            </div>
          )}

          {importResult?.success && importResult.layout && (
            <SeatMapPreview layout={importResult.layout} />
          )}

          {!importResult?.success && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleImport}
                disabled={isPending || !csvText.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Importing…' : 'Import'}
              </button>
            </div>
          )}
        </div>
      )}

      {seatMaps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-500">No seat maps yet. Import a CSV to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {seatMaps.map(map => (
            <div key={map.id} className="rounded-xl border border-gray-200 bg-white p-5 flex items-center justify-between gap-4">
              {deletingId === map.id ? (
                <div className="flex-1">
                  <p className="text-sm text-gray-700 mb-3">
                    Delete <strong>{map.name}</strong>? Events using this seat map will be unaffected.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(map.id)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                    >
                      Yes, Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(null)}
                      className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{map.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {map.total_seats.toLocaleString()} seats ·{' '}
                      {new Date(map.created_at).toLocaleDateString('en-AU')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeletingId(map.id)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
