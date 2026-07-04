'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { parseScan, parseManual, type ParsedScan } from '@/lib/scanner/parse-qr'
import { describeScanResult } from '@/lib/scanner/result'
import { scanTicket } from '@/app/scan/actions'

type ResultView = {
  decision: 'admit' | 'reject'
  label: string
  reason: string
  holderName: string | null
  /** Reserved seating: the seat the door directs the guest to. */
  seatLabel: string | null
}

const RESULT_HOLD_MS = 4000
const SAME_CODE_DEBOUNCE_MS = 3000

// Minimal shape of the native BarcodeDetector we rely on (feature-detected).
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }

/**
 * Door check-in scanner. Two input paths, no third-party dependency:
 *  - Camera scanning via the browser-native BarcodeDetector where available
 *    (progressive enhancement; Android Chrome and recent Chromium).
 *  - Manual / paste entry, which works on every device (type the code + secret,
 *    or paste the whole bearer URL). This is the universal path for iOS Safari.
 * Every decode resolves to a single ADMIT/REJECT decision from the server, which
 * holds the admit-exactly-once invariant.
 */
export function Scanner({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)
  const busyRef = useRef(false)
  const lastScanRef = useRef<{ key: string; at: number } | null>(null)

  const [cameraSupported, setCameraSupported] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [result, setResult] = useState<ResultView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [secret, setSecret] = useState('')

  useEffect(() => {
    setCameraSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window)
  }, [])

  const submit = useCallback(
    async (parsed: ParsedScan) => {
      if (busyRef.current) return
      const key = `${parsed.ticketCode}:${parsed.secret}`
      const now = Date.now()
      if (lastScanRef.current && lastScanRef.current.key === key && now - lastScanRef.current.at < SAME_CODE_DEBOUNCE_MS) {
        return
      }
      lastScanRef.current = { key, at: now }
      busyRef.current = true
      setError(null)
      try {
        const outcome = await scanTicket(eventId, parsed.ticketCode, parsed.secret)
        if (outcome.result === 'error') {
          setError(outcome.error ?? 'Scan failed. Try again.')
          setResult(null)
        } else {
          const view = describeScanResult(outcome.result)
          setResult({ ...view, holderName: outcome.holderName, seatLabel: outcome.seatLabel })
        }
      } finally {
        busyRef.current = false
        window.setTimeout(() => setResult(null), RESULT_HOLD_MS)
      }
    },
    [eventId],
  )

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }, [])

  const tick = useCallback(async () => {
    const video = videoRef.current
    const detector = detectorRef.current
    if (!video || !detector || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    try {
      const codes = await detector.detect(video)
      for (const c of codes) {
        const parsed = parseScan(c.rawValue)
        if (parsed) {
          await submit(parsed)
          break
        }
      }
    } catch {
      // a transient detect failure is non-fatal; keep scanning
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [submit])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector
      detectorRef.current = new Ctor({ formats: ['qr_code'] })
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraOn(true)
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setError('Camera unavailable. Use manual entry below.')
      stopCamera()
    }
  }, [tick, stopCamera])

  useEffect(() => () => stopCamera(), [stopCamera])

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseManual(code, secret)
    if (!parsed) {
      setError('Enter a valid ticket code and key, or paste the full ticket link.')
      return
    }
    setCode('')
    setSecret('')
    void submit(parsed)
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <p className="text-sm text-[var(--text-secondary)]">Door check-in</p>
      <h1 className="type-rail-heading mt-1 text-[var(--text-primary)]">{eventTitle}</h1>

      {result && (
        <div
          role="status"
          aria-live="assertive"
          className="mt-5 rounded-2xl p-6 text-center text-white"
          style={{ background: result.decision === 'admit' ? 'var(--color-success)' : 'var(--color-error)' }}
        >
          <p className="text-3xl font-bold tracking-wide">{result.label}</p>
          {result.holderName && <p className="mt-1 text-lg">{result.holderName}</p>}
          {result.seatLabel && (
            <p className="mt-1 text-xl font-semibold">{result.seatLabel}</p>
          )}
          {result.reason && <p className="mt-1 text-base opacity-90">{result.reason}</p>}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}

      {cameraSupported && (
        <div className="mt-5">
          <div className="overflow-hidden rounded-2xl bg-[#0A1628]">
            <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
          </div>
          <div className="mt-3">
            {cameraOn ? (
              <Button variant="secondary" className="w-full" onClick={stopCamera}>
                Stop camera
              </Button>
            ) : (
              <Button variant="primary" className="w-full" onClick={startCamera}>
                Start camera
              </Button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={onManualSubmit} className="mt-6 space-y-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">Manual entry</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="EL-XXXX-XXXX or paste the ticket link"
          className="h-11 w-full rounded-lg border border-ink-300 px-3 text-base text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Key (leave blank if you pasted the link)"
          className="h-11 w-full rounded-lg border border-ink-300 px-3 text-base text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="primary" className="w-full">
          Check in
        </Button>
      </form>
    </div>
  )
}
