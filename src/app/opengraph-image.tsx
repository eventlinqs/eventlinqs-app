import { ImageResponse } from 'next/og'

export const alt = 'EventLinqs: Where the culture gathers'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const NAVY = '#0A1628'
const GOLD = '#D4A017'
const GOLD_BRIGHT = '#E8B738'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '88px 96px',
          background: NAVY,
          backgroundImage: `radial-gradient(ellipse 70% 55% at 100% 0%, ${GOLD_BRIGHT}33 10%, transparent 55%)`,
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            color: GOLD,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          Discover · Host · Gather
        </div>

        <div
          style={{
            marginTop: 40,
            display: 'flex',
            alignItems: 'baseline',
            color: 'white',
            fontSize: 160,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          EVENTLINQS
          <span style={{ color: GOLD, marginLeft: '0.05em' }}>.</span>
        </div>

        <div
          style={{
            marginTop: 32,
            display: 'flex',
            color: 'rgba(255,255,255,0.85)',
            fontSize: 44,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
          }}
        >
          Where the culture gathers.
        </div>

        <div
          style={{
            position: 'absolute',
            left: 96,
            right: 96,
            bottom: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: 'rgba(255,255,255,0.55)',
            fontSize: 22,
            fontWeight: 500,
          }}
        >
          <span>Transparent pricing. Zero hidden fees.</span>
          <span>eventlinqs.com</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
