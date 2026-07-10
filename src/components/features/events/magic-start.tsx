'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Sparkles } from 'lucide-react'
import type { MagicStartDraft } from '@/lib/ai/magic-start'

/**
 * Magic Start: describe your event once, and it prefills the whole draft.
 *
 * Voice input is FREE: it uses the browser's built-in SpeechRecognition (Web
 * Speech API), no external service and no audio stored. The live transcript
 * is editable text the organiser can correct before running Magic Start, and
 * typing is always available as the fallback. The transcript is treated as
 * untrusted input and sanitised server-side, exactly like typed text.
 *
 * Magic Start never publishes: it hands the wizard an editable draft, and
 * unresolved fields are surfaced so the organiser fills them deliberately.
 */

// Minimal typing for the Web Speech API (not in the DOM lib).
type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function MagicStart({
  onDraft,
}: {
  onDraft: (draft: MagicStartDraft) => void
}) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')

  useEffect(() => {
    setVoiceSupported(getSpeechRecognitionCtor() !== null)
    return () => {
      try {
        recognitionRef.current?.stop()
      } catch {
        // recognition may already be stopped
      }
    }
  }, [])

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    setError(null)
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-AU'
    finalRef.current = text ? text.trimEnd() + ' ' : ''
    rec.onresult = e => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!
        if (r.isFinal) finalRef.current += r[0].transcript + ' '
        else interim += r[0].transcript
      }
      setText((finalRef.current + interim).trimStart())
    }
    rec.onerror = ev => {
      setError(
        ev.error === 'not-allowed'
          ? 'Microphone access was blocked. You can type your description instead.'
          : 'Voice input stopped. You can keep typing.',
      )
      setListening(false)
    }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setError('Voice input could not start. You can type your description instead.')
    }
  }

  const runMagic = async () => {
    const description = text.trim()
    if (description.length < 12) {
      setError('Add a little more detail, then try again.')
      return
    }
    recognitionRef.current?.stop()
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/magic-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      if (res.status === 429) {
        setError('You have run Magic Start a lot in a short time. Please wait a moment, or fill the form in manually.')
        return
      }
      if (!res.ok) {
        setError('Magic Start is unavailable right now. You can fill the form in manually below.')
        return
      }
      const data = (await res.json()) as { ok: boolean; draft?: MagicStartDraft }
      if (data.ok && data.draft) onDraft(data.draft)
      else setError('Magic Start could not read that. Try describing your event a little differently.')
    } catch {
      setError('Something went wrong. You can fill the form in manually below.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gold-400/50 bg-gradient-to-br from-gold-100/60 to-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-gold-800" aria-hidden />
        <h2 className="font-display text-lg font-bold text-ink-900">Magic Start</h2>
      </div>
      <p className="mt-1 text-sm text-ink-600">
        Describe your event and we will build it. Speak or type: date, venue, tickets and price all get filled in
        for you, ready to edit.
      </p>

      <div className="mt-4 relative">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          placeholder="e.g. Afrobeats night at The Wool Exchange in Geelong next Friday at 8pm, general admission $25, VIP $45, 200 capacity"
          className="w-full resize-y rounded-xl border border-ink-200 bg-white p-3 pr-12 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/30"
          aria-label="Describe your event"
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={listening}
            className={`absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              listening
                ? 'animate-pulse bg-red-500 text-white'
                : 'bg-ink-900 text-white hover:bg-ink-800'
            }`}
          >
            {listening ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
          </button>
        )}
      </div>

      {listening && (
        <p className="mt-2 text-xs font-medium text-red-600" aria-live="polite">
          Listening. Speak your description, then tap the microphone to stop.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runMagic}
          disabled={running || text.trim().length < 12}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {running ? 'Building your draft...' : 'Build my event'}
        </button>
        <span className="text-xs text-ink-500">
          {voiceSupported ? 'Tap the microphone to speak, or type above.' : 'Type your description above.'}
        </span>
      </div>
    </div>
  )
}
