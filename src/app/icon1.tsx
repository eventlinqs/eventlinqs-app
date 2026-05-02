import { ImageResponse } from 'next/og'

export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

const NAVY = '#0A1628'
const GOLD = '#D4A017'

export default function Icon192() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: NAVY,
          borderRadius: 38,
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            color: 'white',
            fontSize: 132,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
          }}
        >
          E
          <span style={{ color: GOLD, marginLeft: '0.04em' }}>.</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
