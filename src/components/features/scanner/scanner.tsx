'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { parseScan, parseManual, type ParsedScan } from '@/lib/scanner/parse-qr'
import { scanTicket, downloadValidationPage, syncOfflineScans } from '@/app/scan/actions'
import { DoorStore } from '@/lib/scanner/door-store'
import { sha256Hex, validateOffline, setState, expiryFor } from '@/lib/scanner/offline-validate'
import { nextBatch, toSyncPayload, applySyncOutcomes, statusFromResult, type SyncSummary } from '@/lib/scanner/door-sync'
import {
  describeSet,
  describeMode,
  describePending,
  describeSyncSummary,
  describeFlag,
  describeDoorOutcome,
} from '@/lib/scanner/door-copy'
import { getDeviceId } from '@/lib/scanner/device-id'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import {
  subscribeToDoor,
  liveEntryFrom,
  applyLiveEntry,
  describeLiveEntry,
  describeLiveStatus,
  checkedInLine,
  feedFor,
  type LiveStatus,
} from '@/lib/scanner/door-live'
import {
  DOOR_SERVICE_WORKER_SCOPE,
  DOOR_SERVICE_WORKER_URL,
  DOOR_SHELL_CACHE,
  DOOR_SET_MAX_TICKETS,
  type DoorOutcome,
  type DoorSetMeta,
  type DoorTicketRecord,
  type LiveEntry,
  type SyncOutcome,
} from '@/lib/scanner/door-types'

type ResultView = {
  decision: 'admit' | 'reject'
  label: string
  reason: string
  holderName: string | null
  /** Reserved seating: the seat the door directs the guest to. */
  seatLabel: string | null
  /** The ticket type, from the door list when this phone holds one. */
  tierName: string | null
  judgedBy: 'server' | 'device'
}

type SetStatus = 'loading' | 'none' | 'ready' | 'expired' | 'failed'
type ShellStatus = 'pending' | 'registered' | 'cached' | 'unsupported' | 'failed'

const RESULT_HOLD_MS = 4000
const SAME_CODE_DEBOUNCE_MS = 3000
/** How long the door waits for the server before the door list answers instead. */
const SERVER_ANSWER_MS = 12000
/** While scans are waiting and the phone says it is online, try again this often. */
const SYNC_RETRY_MS = 30000

// Minimal shape of the native BarcodeDetector we rely on (feature-detected).
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${what} did not answer within ${Math.round(ms / 1000)} seconds`)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Door check-in scanner. Two input paths, no third-party dependency:
 *  - Camera scanning via the browser-native BarcodeDetector where available
 *    (progressive enhancement; Android Chrome and recent Chromium).
 *  - Manual / paste entry, which works on every device (type the code + secret,
 *    or paste the whole bearer URL). This is the universal path for iOS Safari.
 *
 * ONLINE, the server judges every decode through scan_ticket, which holds the
 * admit-exactly-once invariant. OFFLINE (Scope v5 3.13), the phone judges
 * against the door list it downloaded when it opened: every ticket of the
 * event with a SHA-256 of its secret, kept in IndexedDB for 24 hours. Every
 * offline judgement is queued and reconciled by sync_offline_scans when the
 * signal returns; if another door admitted the same ticket first, this one is
 * flagged for the organiser. A service worker keeps the page itself so a
 * reload at a signal-less gate does not lose the door.
 *
 * LIVE (Scope v5 3.13, B2), every door subscribes to its event's admissions
 * on Supabase Realtime. Another door's admitted row moves this phone's local
 * record to scanned the moment it lands, so a ticket admitted at Door A is
 * refused at Door B even if Door B loses its signal a minute later, with no
 * sync in between; the strip shows who admitted whom and the running count.
 */
export function Scanner({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)
  const busyRef = useRef(false)
  const lastScanRef = useRef<{ key: string; at: number } | null>(null)
  const storeRef = useRef<DoorStore | null>(null)
  const metaRef = useRef<DoorSetMeta | null>(null)
  const deviceIdRef = useRef<string>('')
  const downloadingRef = useRef(false)
  const syncingRef = useRef(false)
  /**
   * THE WARM-UP WINDOW. Measured on TEST on 5 September 2026: a row inserted
   * straight after the channel said SUBSCRIBED did not arrive, and one inserted
   * ten seconds later did. So the door list is downloaded again the first time
   * the channel goes live in a session: anything admitted between the first
   * download and the moment the feed was truly listening lands in that refresh,
   * and everything after it arrives live. One extra download per session.
   */
  const refreshedOnLiveRef = useRef(false)

  const [cameraSupported, setCameraSupported] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [result, setResult] = useState<ResultView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [secret, setSecret] = useState('')

  const [online, setOnline] = useState(true)
  const [storeReady, setStoreReady] = useState(false)
  const [meta, setMeta] = useState<DoorSetMeta | null>(null)
  const [ticketCount, setTicketCount] = useState(0)
  const [setStatus, setSetStatus] = useState<SetStatus>('loading')
  const [listError, setListError] = useState<string | null>(null)
  const [capped, setCapped] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<{ summary: SyncSummary; flags: string[] } | null>(null)
  const [shell, setShell] = useState<ShellStatus>('pending')
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('off')
  const [liveError, setLiveError] = useState<string | null>(null)
  const [liveFeed, setLiveFeed] = useState<{ entry: LiveEntry; text: string }[]>([])
  const [checkedIn, setCheckedIn] = useState(0)

  const setReady = setStatus === 'ready'

  const refreshCounts = useCallback(async () => {
    const store = storeRef.current
    if (!store) return
    setPendingCount(await store.countPending(eventId))
    setTicketCount(await store.countTickets(eventId))
    setCheckedIn(await store.countCheckedIn(eventId))
  }, [eventId])

  /* ── the shell: the page itself, kept for an offline reload ───────────── */

  const warmShell = useCallback(async () => {
    if (typeof window === 'undefined' || !('caches' in window) || !('serviceWorker' in navigator)) return
    try {
      const cache = await caches.open(DOOR_SHELL_CACHE)
      const origin = window.location.origin
      const assets = new Set<string>([window.location.pathname])
      for (const script of Array.from(document.scripts)) {
        if (script.src.startsWith(`${origin}/_next/static/`)) assets.add(script.src)
      }
      for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[href]'))) {
        if (link.href.startsWith(`${origin}/_next/static/`)) assets.add(link.href)
      }
      await Promise.all([...assets].map((url) => cache.add(url)))
      setShell('cached')
    } catch (warmError) {
      setShell('failed')
      console.warn('[door] the scanner page could not be kept for an offline reload', errorText(warmError))
    }
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setShell('unsupported')
      return
    }
    navigator.serviceWorker
      .register(DOOR_SERVICE_WORKER_URL, { scope: DOOR_SERVICE_WORKER_SCOPE })
      .then(() => setShell((prev) => (prev === 'cached' ? prev : 'registered')))
      .catch((registerError: unknown) => {
        setShell('failed')
        console.warn('[door] the door service worker could not be registered', errorText(registerError))
      })
  }, [])

  /* ── the door list ─────────────────────────────────────────────────────── */

  const downloadSet = useCallback(async () => {
    const store = storeRef.current
    if (!store || downloadingRef.current) return
    downloadingRef.current = true
    setDownloading(true)
    setListError(null)
    try {
      const rows: DoorTicketRecord[] = []
      let after: string | null = null
      let serverNow = new Date().toISOString()
      for (;;) {
        const page = await downloadValidationPage(eventId, after)
        if (!page.ok) throw new Error(page.error)
        rows.push(...page.rows)
        serverNow = page.serverNow
        if (page.done || rows.length >= DOOR_SET_MAX_TICKETS) break
        after = page.rows[page.rows.length - 1].ticketCode
      }
      const overCap = rows.length > DOOR_SET_MAX_TICKETS
      const kept = overCap ? rows.slice(0, DOOR_SET_MAX_TICKETS) : rows
      const count = await store.replaceTickets(eventId, kept)
      const next: DoorSetMeta = {
        eventId,
        eventTitle,
        downloadedAt: serverNow,
        expiresAt: expiryFor(serverNow),
        ticketCount: count,
        deviceId: deviceIdRef.current,
        version: 1,
      }
      await store.putMeta(next)
      metaRef.current = next
      setMeta(next)
      setTicketCount(count)
      setCapped(overCap)
      setSetStatus('ready')
      void warmShell()
    } catch (downloadError) {
      setListError(`The door list could not be downloaded: ${errorText(downloadError)}`)
      setSetStatus((prev) => (prev === 'loading' ? 'failed' : prev))
    } finally {
      downloadingRef.current = false
      setDownloading(false)
    }
  }, [eventId, eventTitle, warmShell])

  /* ── the queue ─────────────────────────────────────────────────────────── */

  const syncQueue = useCallback(async () => {
    const store = storeRef.current
    if (!store || syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    setSyncing(true)
    setSyncError(null)
    const totals: SyncSummary = { synced: 0, admitted: 0, needsReview: 0, flagged: [] }
    const flags: string[] = []
    try {
      for (let round = 0; round < 50; round += 1) {
        const pending = await store.pendingScans(eventId)
        if (pending.length === 0) break
        const batch = nextBatch(pending)
        const answer = await syncOfflineScans(eventId, toSyncPayload(batch))
        if (!answer.ok) throw new Error(answer.error)
        const summary = await applySyncOutcomes(store, eventId, answer.outcomes, answer.serverNow)
        totals.synced += summary.synced
        totals.admitted += summary.admitted
        totals.needsReview += summary.needsReview
        totals.flagged.push(...summary.flagged)
        const codes = new Map(batch.map((b) => [b.clientScanId, b.ticketCode]))
        for (const flag of summary.flagged as SyncOutcome[]) {
          flags.push(describeFlag(flag, codes.get(flag.clientScanId) ?? 'A ticket'))
        }
        if (summary.synced === 0) break
      }
      if (totals.synced > 0) setLastSync({ summary: totals, flags })
    } catch (syncFailure) {
      setSyncError(`Queued scans are still waiting to sync: ${errorText(syncFailure)}`)
    } finally {
      await refreshCounts()
      syncingRef.current = false
      setSyncing(false)
    }
  }, [eventId, refreshCounts])

  /* ── open the store, listen for the network ────────────────────────────── */

  useEffect(() => {
    let cancelled = false
    setOnline(navigator.onLine)
    setCameraSupported('BarcodeDetector' in window)
    deviceIdRef.current = getDeviceId()
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    void (async () => {
      try {
        const store = await DoorStore.open()
        if (cancelled) {
          store.close()
          return
        }
        storeRef.current = store
        const stored = await store.getMeta(eventId)
        metaRef.current = stored
        setMeta(stored)
        setTicketCount(await store.countTickets(eventId))
        setPendingCount(await store.countPending(eventId))
        setSetStatus(stored ? (setState(stored).state === 'ready' ? 'ready' : 'expired') : 'none')
        setStoreReady(true)
      } catch (openError) {
        setSetStatus('failed')
        setListError(`This browser cannot keep a door list (${errorText(openError)}). Online scanning still works.`)
      }
    })()

    return () => {
      cancelled = true
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      storeRef.current?.close()
      storeRef.current = null
    }
  }, [eventId])

  // Whenever the phone is online with the store open: settle the queue, then
  // refresh a missing or expired list.
  useEffect(() => {
    if (!storeReady || !online) return
    void (async () => {
      await syncQueue()
      const state = setState(metaRef.current).state
      if (state !== 'ready') await downloadSet()
    })()
  }, [storeReady, online, syncQueue, downloadSet])

  useEffect(() => {
    if (!online || pendingCount === 0) return
    const timer = window.setInterval(() => void syncQueue(), SYNC_RETRY_MS)
    return () => window.clearInterval(timer)
  }, [online, pendingCount, syncQueue])

  // The other doors: one channel on the event's admissions while the phone is
  // online. A row from another door moves the local record and joins the feed;
  // this phone's own rows echo back and only refresh the count.
  useEffect(() => {
    if (!storeReady || !online) {
      setLiveStatus('off')
      return
    }
    let leave: (() => void) | null = null
    let cancelled = false
    void subscribeToDoor({
      client: createBrowserClient(),
      eventId,
      onStatus: (status, error) => {
        setLiveStatus(status)
        setLiveError(error)
        if (status === 'live' && !refreshedOnLiveRef.current) {
          refreshedOnLiveRef.current = true
          void downloadSet()
        }
      },
      onRow: (row) => {
        const entry = liveEntryFrom(row, eventId, deviceIdRef.current)
        if (!entry) return
        void (async () => {
          const store = storeRef.current
          const applied = store ? await applyLiveEntry(store, eventId, entry) : { record: null, changed: false }
          if (!entry.mine) {
            const text = describeLiveEntry(entry, applied.record)
            setLiveFeed((prev) => feedFor([entry, ...prev.map((p) => p.entry)]).map((e) => ({ entry: e, text: e.scanId === entry.scanId ? text : (prev.find((p) => p.entry.scanId === e.scanId)?.text ?? describeLiveEntry(e, null)) })))
          }
          await refreshCounts()
        })()
      },
    }).then((l) => {
      if (cancelled) l()
      else leave = l
    })
    return () => {
      cancelled = true
      leave?.()
      setLiveStatus('off')
    }
  }, [storeReady, online, eventId, refreshCounts, downloadSet])

  /* ── judging a scan ────────────────────────────────────────────────────── */

  const judgeOffline = useCallback(
    async (parsed: ParsedScan): Promise<DoorOutcome> => {
      const store = storeRef.current
      const now = new Date()
      const secretHash = await sha256Hex(parsed.secret)
      const record = store ? await store.getTicket(eventId, parsed.ticketCode) : null
      const outcome = validateOffline({ record, secretHash, meta: metaRef.current, now: now.getTime() })
      if (!store || outcome.result === 'stale_set') return outcome
      if (outcome.result === 'admitted') await store.markAdmittedLocally(eventId, parsed.ticketCode, now.toISOString())
      await store.enqueue({
        clientScanId: crypto.randomUUID(),
        eventId,
        ticketCode: parsed.ticketCode,
        secretHash,
        scannedAt: now.toISOString(),
        deviceId: deviceIdRef.current,
        offlineResult: outcome.result,
        holderName: outcome.holderName,
        state: 'pending',
      })
      await refreshCounts()
      return outcome
    },
    [eventId, refreshCounts],
  )

  const judgeOnline = useCallback(
    async (parsed: ParsedScan): Promise<DoorOutcome> => {
      const outcome = await withTimeout(scanTicket(eventId, parsed.ticketCode, parsed.secret, deviceIdRef.current), SERVER_ANSWER_MS, 'The server')
      if (outcome.result === 'error') throw new Error(outcome.error ?? 'Scan failed. Try again.')
      const store = storeRef.current
      const record = store ? await store.getTicket(eventId, parsed.ticketCode) : null
      const status = statusFromResult(outcome.result)
      if (store && record && status) {
        await store.applyServerTruth(eventId, parsed.ticketCode, { status, firstScannedAt: outcome.firstScannedAt })
        await refreshCounts()
      }
      return {
        result: outcome.result as DoorOutcome['result'],
        holderName: outcome.holderName,
        tierName: record?.tierName ?? null,
        seatLabel: outcome.seatLabel,
        firstScannedAt: outcome.firstScannedAt,
        judgedBy: 'server',
      }
    },
    [eventId, refreshCounts],
  )

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
        let outcome: DoorOutcome
        if (!navigator.onLine) {
          outcome = await judgeOffline(parsed)
        } else {
          try {
            outcome = await judgeOnline(parsed)
          } catch (serverError) {
            const text = errorText(serverError)
            // An authorisation refusal is the server answering; the door list must not overrule it.
            if (/not authorised|sign in/i.test(text)) throw serverError
            console.warn('[door] the server could not be reached, judging against the door list', text)
            setOnline(false)
            outcome = await judgeOffline(parsed)
          }
        }
        const view = describeDoorOutcome(outcome)
        setResult({
          ...view,
          holderName: outcome.holderName,
          seatLabel: outcome.seatLabel,
          tierName: outcome.tierName,
          judgedBy: outcome.judgedBy,
        })
      } catch (scanError) {
        setError(errorText(scanError))
        setResult(null)
      } finally {
        busyRef.current = false
        window.setTimeout(() => setResult(null), RESULT_HOLD_MS)
      }
    },
    [judgeOffline, judgeOnline],
  )

  /* ── the camera ────────────────────────────────────────────────────────── */

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

  const renderedAt = Date.now()
  const setLine = listError ?? (setStatus === 'loading' ? 'Opening the door list.' : describeSet(meta, ticketCount, renderedAt))

  return (
    <div className="mx-auto w-full max-w-md">
      <p className="text-sm text-[var(--text-secondary)]">Door check-in</p>
      <h1 className="type-rail-heading mt-1 text-[var(--text-primary)]">{eventTitle}</h1>

      <section aria-label="Door status" data-testid="door-strip" className="mt-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span data-testid="door-mode" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-900">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-success' : 'bg-error'}`} />
            {describeMode(online, setReady)}
          </span>
          {pendingCount > 0 && (
            <span data-testid="door-pending" className="rounded-full bg-gold-100 px-2.5 py-1 text-xs font-semibold text-ink-900">
              {describePending(pendingCount)}
            </span>
          )}
        </div>
        <p data-testid="door-set" className="mt-2 text-sm text-ink-700">
          {setLine}
          {capped ? ` The list is capped at ${DOOR_SET_MAX_TICKETS.toLocaleString('en-AU')} tickets, so a scan the phone cannot find is checked online.` : ''}
        </p>
        {(shell === 'failed' || shell === 'unsupported') && (
          <p className="mt-2 text-sm text-ink-700">Keep this page open. This browser cannot reopen the scanner without a signal.</p>
        )}
        <div data-testid="door-live" className="mt-3 border-t border-ink-100 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span data-testid="door-live-status" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-900">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${liveStatus === 'live' ? 'bg-success' : 'bg-ink-300'}`} />
              {online ? describeLiveStatus(liveStatus) : 'Live feed paused while offline'}
            </span>
            <span data-testid="door-checked-in" className="text-sm font-semibold tabular-nums text-ink-900">
              {checkedInLine(checkedIn, ticketCount)}
            </span>
          </div>
          {liveError && liveStatus !== 'live' && <p className="mt-1 text-xs text-ink-700">{liveError}</p>}
          {liveFeed.length > 0 && (
            <ul aria-label="Scans at the other doors" className="mt-2 space-y-1">
              {liveFeed.map(({ entry, text }) => (
                <li key={entry.scanId} data-testid="door-live-entry" className="text-sm text-ink-700">
                  {text}
                </li>
              ))}
            </ul>
          )}
        </div>
        {lastSync && lastSync.summary.synced > 0 && (
          <p data-testid="door-sync" role="status" className="mt-2 text-sm text-ink-700">
            {describeSyncSummary(lastSync.summary)}
          </p>
        )}
        {lastSync?.flags.map((flag) => (
          <p key={flag} data-testid="door-flag" role="status" className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-sm text-ink-900">
            {flag}
          </p>
        ))}
        {syncError && (
          <p role="alert" className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-sm text-ink-900">
            {syncError}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" className="min-h-11" onClick={() => void downloadSet()} disabled={!online || downloading || !storeReady}>
            {downloading ? 'Downloading the door list' : 'Refresh door list'}
          </Button>
          {pendingCount > 0 && (
            <Button variant="secondary" className="min-h-11" onClick={() => void syncQueue()} disabled={!online || syncing}>
              {syncing ? 'Syncing' : 'Sync now'}
            </Button>
          )}
        </div>
      </section>

      {result && (
        /*
         * THE FILL IS THE SIGNAL, THE INSET IS THE TEXT. The solid green or red
         * block is what a door reads at arm's length in a noisy venue (Scope v5
         * 3.13: green for valid, red for used or invalid), and the big label is
         * large text, which white clears on both fills. The detail lines are
         * normal text and white does not clear 4.5:1 on the success green
         * (measured 3.5:1 by axe on the B1 drive, 5 September 2026), so they
         * sit on a white inset in ink, the same ruling the bearer ticket page
         * records: the tint carries the status, the dark text guarantees the
         * contrast. A /95 white without a backdrop filter is not glass.
         */
        <div
          role="status"
          aria-live="assertive"
          data-testid="scan-result"
          className="mt-5 rounded-2xl p-5 text-center text-white"
          style={{ background: result.decision === 'admit' ? 'var(--color-success)' : 'var(--color-error)' }}
        >
          <p className="text-3xl font-bold tracking-wide">{result.label}</p>
          <div className="mt-3 rounded-xl bg-white/95 px-4 py-3 text-ink-900">
            {result.holderName && <p className="text-lg font-semibold">{result.holderName}</p>}
            {result.tierName && <p className="mt-0.5 text-base text-ink-700">{result.tierName}</p>}
            {result.seatLabel && <p className="mt-1 text-xl font-semibold">{result.seatLabel}</p>}
            {result.reason && <p className="mt-1 text-base font-medium">{result.reason}</p>}
            <p data-testid="scan-result-judged" className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-700">
              {result.judgedBy === 'device' ? 'Checked offline against the door list' : 'Checked online'}
            </p>
          </div>
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
          aria-label="Ticket code or ticket link"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="EL-XXXX-XXXX or paste the ticket link"
          className="h-11 w-full rounded-lg border border-ink-300 px-3 text-base text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <input
          aria-label="Ticket key"
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
