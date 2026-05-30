'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { parseScan, parseManual, type ParsedScan } from '@/lib/scanner/parse-qr'
import { describeScanResult } from '@/lib/scanner/result'
import { scanTicket } from '@/app/scan/actions'

type CameraState = 'starting' | 'live' | 'unavailable'

type ResultView = {
  decision: 'admit' | 'reject'
  label: string
  reason: string
  holderName: string | null
}

const RESULT_HOLD_MS = 4000
const SAME_CODE_DEBOUNCE_MS = 3000

export function Scanner({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const busyRef = useRef(false)
  const lastScanRef = useRef<{ key: string; at: number } | null>(null)
  const manualCodeRef = useRef<HTMLInputElement | null>(null)

  const [cameraState, setCameraState] = useState<CameraState>('starting')
  const [result, setResult] = useState<ResultView | null>(null)
  const [busy, setBusy] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [manualSecret, setManualSecret] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)

  const submit = useCallback(
    async (parsed: ParsedScan, sourceKey: string) => {
      if (busyRef.current) return
      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.key === sourceKey && now - last.at < SAME_CODE_DEBOUNCE_MS) return

      busyRef.current = true
      lastScanRef.current = { key: sourceKey, at: now }
      setBusy(true)
      try {
        const outcome = await scanTicket(eventId, parsed.ticketCode, parsed.secret)
        if (outcome.error) {
          setResult({ decision: 'reject', label: 'REJECT', reason: outcome.error, holderName: null })
        } else {
          const view = describeScanResult(outcome.result)
          setResult({ ...view, holderName: outcome.holderName })
        }
      } catch {
        setResult({ decision: 'reject', label: 'REJECT', reason: 'Scan failed. Try again.', holderName: null })
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [eventId],
  )

  // Auto-clear the result so the next attendee can be scanned.
  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => setResult(null), RESULT_HOLD_MS)
    return () => clearTimeout(t)
  }, [result])

  // Camera + decode loop. On any failure, fall back to manual entry; never blank.
  useEffect(() => {
    let cancelled = false

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('unavailable')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
        }
        setCameraState('live')
        tick()
      } catch {
        if (!cancelled) setCameraState('unavailable')
      }
    }

    function tick() {
      rafRef.current = requestAnimationFrame(tick)
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(image.data, image.width, image.height)
      if (!code) return
      const parsed = parseScan(code.data)
      if (parsed) void submit(parsed, `${parsed.ticketCode}:${parsed.secret}`)
    }

    void start()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [submit])

  // Focus the manual field when the camera is unavailable so staff never stall.
  useEffect(() => {
    if (cameraState === 'unavailable') manualCodeRef.current?.focus()
  }, [cameraState])

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    setManualError(null)
    const parsed = parseManual(manualCode, manualSecret)
    if (!parsed) {
      setManualError('Enter a valid ticket code and key, or paste the full ticket link.')
      return
    }
    setManualCode('')
    setManualSecret('')
    void submit(parsed, `manual:${parsed.ticketCode}:${parsed.secret}`)
  }

  return (
    <div className="min-h-screen bg-ink-950 text-white flex flex-col">
      <header className="px-4 py-3 border-b border-white/10">
        <p className="text-xs uppercase tracking-widest text-white/50">Door check-in</p>
        <h1 className="text-lg font-semibold truncate">{eventTitle}</h1>
      </header>

      <main className="flex-1 flex flex-col gap-6 p-4">
        <section aria-label="Camera scanner" className="relative">
          {cameraState !== 'unavailable' ? (
            <div className="relative mx-auto w-full max-w-sm aspect-square overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
                aria-label="Live camera preview"
              />
              <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/70" aria-hidden />
              {cameraState === 'starting' && (
                <p className="absolute inset-0 flex items-center justify-center text-white/70">
                  Starting camera...
                </p>
              )}
            </div>
          ) : (
            <div
              role="status"
              className="mx-auto w-full max-w-sm rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5 text-center"
            >
              <p className="font-semibold text-amber-200">Camera unavailable</p>
              <p className="mt-1 text-sm text-white/70">
                Allow camera access, or enter the ticket code below by hand.
              </p>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </section>

        <section aria-label="Manual code entry" className="mx-auto w-full max-w-sm">
          <h2 className="text-sm font-medium text-white/70 mb-2">Enter a code by hand</h2>
          <form onSubmit={onManualSubmit} className="space-y-3">
            <input
              ref={manualCodeRef}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="EL-XXXX-XXXX or full ticket link"
              autoCapitalize="characters"
              autoComplete="off"
              className="w-full min-h-[44px] rounded-lg border border-white/20 bg-white/5 px-4 text-white placeholder:text-white/40 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
            <input
              value={manualSecret}
              onChange={(e) => setManualSecret(e.target.value)}
              placeholder="Key (leave blank if pasting a full link)"
              autoComplete="off"
              className="w-full min-h-[44px] rounded-lg border border-white/20 bg-white/5 px-4 text-white placeholder:text-white/40 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
            {manualError && <p className="text-sm text-red-300">{manualError}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] rounded-lg bg-gold-500 px-4 font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-50"
            >
              Check in
            </button>
          </form>
        </section>
      </main>

      {result && (
        <button
          type="button"
          onClick={() => setResult(null)}
          aria-live="assertive"
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-6 text-center ${
            result.decision === 'admit' ? 'bg-success' : 'bg-error'
          }`}
        >
          <span className="text-6xl sm:text-7xl font-black tracking-tight text-white">
            {result.label}
          </span>
          {result.reason && <span className="text-2xl font-semibold text-white/90">{result.reason}</span>}
          {result.holderName && <span className="text-lg text-white/80">{result.holderName}</span>}
          <span className="mt-4 text-sm text-white/70">Tap to scan the next ticket</span>
        </button>
      )}
    </div>
  )
}
