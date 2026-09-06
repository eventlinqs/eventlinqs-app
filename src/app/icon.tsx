import { renderOgResponse, OG_DISPLAY_FAMILY } from '@/lib/broadcast/og-response'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

const NAVY = '#0A1628'
const GOLD = '#D4A017'

export default function Icon() {
  return renderOgResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: NAVY,
          borderRadius: 6,
          fontFamily: OG_DISPLAY_FAMILY,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            color: 'white',
            fontSize: 22,
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
    { ...size, where: 'app/icon' }
  )
}
