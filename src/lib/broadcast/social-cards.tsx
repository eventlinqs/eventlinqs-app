/* eslint-disable @next/next/no-img-element -- satori rasterises this tree
   itself inside an ImageResponse; next/image is a browser-side component and
   has no meaning here. The shipped link card at
   src/app/events/[slug]/opengraph-image.tsx carries the same exemption. */
import { ImageResponse } from 'next/og'
import { BODY_FAMILY, DISPLAY_FAMILY, loadCardFonts } from '@/lib/broadcast/card-fonts'
import {
  SOCIAL_CARD_FORMATS,
  SOCIAL_CARD_MAX_BYTES,
  type SocialCardFormat,
} from '@/lib/broadcast/social-card-spec'
import {
  STORY_PANEL_MAX_HEIGHT,
  STORY_PANEL_RATIO_THRESHOLD,
  fitTitle,
  photoBox,
  ticketBarText,
} from '@/lib/broadcast/social-card-layout'

/**
 * THE SOCIAL CARD SET.
 *
 * One composition language, rendered at every shape a promoter actually posts:
 * a 9:16 story, a 1:1 square and a 4:5 tall post. The geometry and the reason
 * for each number live in social-card-spec.ts beside the published rule it
 * answers; this file draws them.
 *
 * FIVE RULES THIS FILE KEEPS.
 *
 * 1. The platform never generates imagery. The organiser's own photograph is
 *    placed. Where a crop would throw the subject away, the photograph is
 *    shown whole instead (see the panel rule below), because a promoter who
 *    chose that frame did so on purpose.
 * 2. No photograph is not a broken card. It becomes a typographic composition
 *    built from the organiser's own event details, which fills the frame at
 *    every shape rather than leaving a navy void.
 * 3. The tracked link is in every artefact, twice: written in the gold ticket
 *    bar beside the price, and as a QR, so even a screenshot of a story still
 *    carries a link that attributes back to a real sale.
 * 4. Their mark leads, ours is subordinate. The organiser logo and trading
 *    name sit at full strength; the EventLinqs mark is one muted line.
 * 5. Type is the brand type: Archivo for display, Hanken Grotesk for the rest,
 *    loaded from src/assets/fonts rather than falling back to a system face.
 *
 * THE PANEL RULE (the answer to the crop complaint). A 16:9 photograph forced
 * into a 9:16 story loses two thirds of the frame, and no saliency heuristic
 * reliably keeps the right third: the first render of this file cropped a
 * comedian out of his own poster and kept the wall behind him. So a landscape
 * or square photograph is placed WHOLE, full width, over a blurred and dimmed
 * copy of itself. Only a photograph that is already close to the story shape
 * is cropped to bleed, where little is lost. Banded formats crop to a shallow
 * region where the loss is small and attention-weighted cropping is safe.
 */

const NAVY = '#0A1628'
const NAVY_DEEP = '#050D18'
const GOLD = '#E8B738'
const GOLD_DEEP = '#D4A017'
const WHITE = '#FFFFFF'

/** A prepared cover: either bleeding to the full frame, or a whole panel. */
export type PreparedCover =
  | { kind: 'bleed'; image: string }
  | { kind: 'panel'; image: string; panelHeight: number }

export type SocialCardInput = {
  /** Event title, unmodified; the layout fits it. */
  title: string
  /** One line, already localised, for example "Saturday 12 September". */
  dateLabel: string
  /** Start time on its own, for example "8:00 pm". */
  timeLabel?: string | null
  /** Venue and city, already joined. */
  placeLabel: string
  /** The live price line, for example "From $25" or "Free entry". */
  priceLabel: string
  /** The tracked short link for the channel this card is being posted to. */
  shortUrl: string
  /** Small gold chip: the event type and the city. */
  eyebrow: string
  /** The organiser's trading name. */
  organiserName: string
  /** Data URI of the organiser's logo, when they have uploaded one. */
  organiserLogo?: string | null
  /** The prepared cover photograph, or null for the typographic composition. */
  cover?: PreparedCover | null
  /** Data URI of the tracked QR code. */
  qr?: string | null
}

/** One set of numbers, scaled to the format width. */
function scaler(format: SocialCardFormat) {
  const s = SOCIAL_CARD_FORMATS[format].width / 1080
  return (n: number) => Math.round(n * s)
}

type Px = (n: number) => number

function Identity({ input, px, size }: { input: SocialCardInput; px: Px; size: 'lg' | 'sm' }) {
  const large = size === 'lg'
  const logoSize = px(large ? 84 : 54)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: px(large ? 22 : 16) }}>
      {input.organiserLogo ? (
        <img
          src={input.organiserLogo}
          alt=""
          width={logoSize}
          height={logoSize}
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: px(large ? 18 : 12),
            objectFit: 'cover',
            background: WHITE,
          }}
        />
      ) : null}
      <div
        style={{
          display: 'flex',
          color: WHITE,
          fontFamily: DISPLAY_FAMILY,
          fontWeight: 700,
          fontSize: px(large ? 33 : 26),
          letterSpacing: px(large ? 1.8 : 1.2),
          textTransform: 'uppercase',
        }}
      >
        {input.organiserName}
      </div>
    </div>
  )
}

function Eyebrow({ text, px }: { text: string; px: Px }) {
  return (
    <div
      style={{
        display: 'flex',
        alignSelf: 'flex-start',
        color: NAVY,
        background: GOLD,
        fontFamily: DISPLAY_FAMILY,
        fontWeight: 800,
        fontSize: px(24),
        letterSpacing: px(2.6),
        textTransform: 'uppercase',
        padding: `${px(11)}px ${px(20)}px ${px(9)}px`,
        borderRadius: px(6),
      }}
    >
      {text}
    </div>
  )
}

function Title({ input, px, format, scale = 1 }: { input: SocialCardInput; px: Px; format: SocialCardFormat; scale?: number }) {
  const fit = fitTitle(input.title, format)
  return (
    <div
      style={{
        display: 'flex',
        color: WHITE,
        fontFamily: DISPLAY_FAMILY,
        fontWeight: 800,
        fontSize: Math.round(fit.fontSize * scale),
        lineHeight: 1.03,
        letterSpacing: px(-1.5),
      }}
    >
      {fit.text}
    </div>
  )
}

function MetaLines({ input, px, size }: { input: SocialCardInput; px: Px; size: 'lg' | 'sm' }) {
  const large = size === 'lg'
  const dateLine = [input.dateLabel, input.timeLabel].filter(Boolean).join(', ')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: px(large ? 9 : 5) }}>
      {dateLine ? (
        <div
          style={{
            display: 'flex',
            color: WHITE,
            fontFamily: BODY_FAMILY,
            fontWeight: 600,
            fontSize: px(large ? 38 : 30),
          }}
        >
          {dateLine}
        </div>
      ) : null}
      {input.placeLabel ? (
        <div
          style={{
            display: 'flex',
            color: 'rgba(255,255,255,0.82)',
            fontFamily: BODY_FAMILY,
            fontWeight: 500,
            fontSize: px(large ? 34 : 27),
          }}
        >
          {input.placeLabel}
        </div>
      ) : null}
    </div>
  )
}

function TicketBar({ input, px, size }: { input: SocialCardInput; px: Px; size: 'lg' | 'sm' }) {
  const large = size === 'lg'
  const height = px(large ? 106 : 76)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height,
        borderRadius: height / 2,
        background: GOLD,
        padding: `0 ${px(large ? 42 : 32)}px`,
        color: NAVY,
        fontFamily: BODY_FAMILY,
        fontWeight: 600,
        fontSize: px(large ? 38 : 30),
      }}
    >
      {ticketBarText(input.priceLabel, input.shortUrl)}
    </div>
  )
}

/** Fixed-width so the tile can never push itself off the edge of the card. */
function QrTile({ qr, px, size }: { qr: string; px: Px; size: number }) {
  const tile = size + px(20)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: tile,
        flexShrink: 0,
        gap: px(9),
      }}
    >
      <div style={{ display: 'flex', background: WHITE, borderRadius: px(12), padding: px(10) }}>
        <img src={qr} alt="" width={size} height={size} style={{ width: size, height: size }} />
      </div>
      <div
        style={{
          display: 'flex',
          color: 'rgba(255,255,255,0.70)',
          fontFamily: BODY_FAMILY,
          fontWeight: 600,
          fontSize: px(17),
        }}
      >
        Scan to buy
      </div>
    </div>
  )
}

function Wordmark({ px, size }: { px: Px; size: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexShrink: 0,
        color: 'rgba(255,255,255,0.58)',
        fontFamily: DISPLAY_FAMILY,
        fontWeight: 700,
        fontSize: size,
        letterSpacing: px(1.4),
      }}
    >
      <span>Ticketing by EVENTLINQS</span>
      <span style={{ color: GOLD_DEEP }}>.</span>
    </div>
  )
}

/**
 * The gold-washed navy ground. Painted on the card ROOT rather than an
 * absolutely positioned child: a probe (tests/proofs/gradient-probe.proof.tsx)
 * confirmed the renderer resolves stacked gradients on an element's own
 * background, which is the form used here.
 */
const GROUND = `radial-gradient(ellipse 90% 34% at 100% 0%, rgba(232,183,56,0.55) 0%, rgba(232,183,56,0.14) 42%, rgba(10,22,40,0) 72%), radial-gradient(ellipse 80% 26% at 0% 100%, rgba(232,183,56,0.20) 0%, rgba(10,22,40,0) 60%), linear-gradient(160deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`

/**
 * No photograph: a full-frame typographic composition from the organiser's own
 * details. One layout, every format, distributed top to bottom so the frame is
 * never half empty.
 */
function TypographicCard({ input, format }: { input: SocialCardInput; format: SocialCardFormat }) {
  const spec = SOCIAL_CARD_FORMATS[format]
  const px = scaler(format)
  const story = format === 'story'
  const pad = px(story ? 76 : 60)
  const size = story ? 'lg' : 'sm'
  const qrSize = px(story ? 140 : 126)
  const ctaTextWidth =
    spec.width - pad * 2 - (input.qr ? qrSize + px(20) + px(30) : 0)

  return (
    <div
      style={{
        width: spec.width,
        height: spec.height,
        display: 'flex',
        position: 'relative',
        background: GROUND,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          top: Math.max(spec.safeTop, pad),
          bottom: Math.max(spec.safeBottom, pad),
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: px(story ? 24 : 18) }}>
          <Identity input={input} px={px} size={size} />
          <Eyebrow text={input.eyebrow} px={px} />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: px(story ? 28 : 20),
            // Two auto margins split the spare height evenly, so the frame
            // reads as a set poster rather than pooling all the air in one gap.
            marginTop: 'auto',
          }}
        >
          <div style={{ display: 'flex', width: px(140), height: px(8), background: GOLD }} />
          <Title input={input} px={px} format={format} scale={story ? 1.45 : 1.28} />
          <MetaLines input={input} px={px} size={size} />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: px(30), marginTop: 'auto' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: ctaTextWidth,
              gap: px(story ? 18 : 14),
            }}
          >
            <TicketBar input={input} px={px} size={size} />
            <Wordmark px={px} size={px(story ? 24 : 20)} />
          </div>
          {input.qr ? <QrTile qr={input.qr} px={px} size={px(story ? 140 : 126)} /> : null}
        </div>
      </div>
    </div>
  )
}

/** 9:16, with a photograph. Everything sits inside the published safe band. */
function StoryCard({ input }: { input: SocialCardInput }) {
  const spec = SOCIAL_CARD_FORMATS.story
  const px = scaler('story')
  const cover = input.cover
  const panel = cover?.kind === 'panel' ? cover : null
  const qrSize = px(140)
  const ctaTextWidth = spec.width - px(76) * 2 - (input.qr ? qrSize + px(20) + px(30) : 0)

  // PANEL MODE: the photograph is shown whole at the top of the frame and the
  // type sits below it on solid navy, distributed to fill. No crop, and no
  // type fighting a photograph for contrast.
  if (panel) {
    return (
      <div
        style={{
          width: spec.width,
          height: spec.height,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: GROUND,
        }}
      >
        <img
          src={panel.image}
          alt=""
          width={spec.width}
          height={panel.panelHeight}
          style={{ width: spec.width, height: panel.panelHeight, flexShrink: 0 }}
        />
        <div style={{ display: 'flex', width: spec.width, height: px(7), background: GOLD, flexShrink: 0 }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            padding: `${px(56)}px ${px(76)}px ${spec.safeBottom}px`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: px(22) }}>
            <Identity input={input} px={px} size="lg" />
            <Eyebrow text={input.eyebrow} px={px} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: px(22), marginTop: 'auto' }}>
            <Title input={input} px={px} format="story" />
            <MetaLines input={input} px={px} size="lg" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: px(30), marginTop: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: ctaTextWidth, gap: px(18) }}>
              <TicketBar input={input} px={px} size="lg" />
              <Wordmark px={px} size={px(24)} />
            </div>
            {input.qr ? <QrTile qr={input.qr} px={px} size={px(140)} /> : null}
          </div>
        </div>
      </div>
    )
  }

  // BLEED MODE: the photograph is already close to the story shape, so it
  // fills the frame and the type sits on the platform hero scrim.
  return (
    <div
      style={{
        width: spec.width,
        height: spec.height,
        display: 'flex',
        position: 'relative',
        background: NAVY,
      }}
    >
      <img
        src={(cover as { image: string }).image}
        alt=""
        width={spec.width}
        height={spec.height}
        style={{ position: 'absolute', inset: 0, width: spec.width, height: spec.height }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background:
            'linear-gradient(to top, rgba(10,22,40,0.98) 0%, rgba(10,22,40,0.96) 44%, rgba(10,22,40,0.62) 68%, rgba(10,22,40,0.14) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: px(76),
          right: px(76),
          bottom: spec.safeBottom,
          display: 'flex',
          flexDirection: 'column',
          gap: px(26),
        }}
      >
        <Identity input={input} px={px} size="lg" />
        <Eyebrow text={input.eyebrow} px={px} />
        <Title input={input} px={px} format="story" />
        <MetaLines input={input} px={px} size="lg" />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: px(30), marginTop: px(6) }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: ctaTextWidth, gap: px(18) }}>
            <TicketBar input={input} px={px} size="lg" />
            <Wordmark px={px} size={px(24)} />
          </div>
          {input.qr ? <QrTile qr={input.qr} px={px} size={px(140)} /> : null}
        </div>
      </div>
    </div>
  )
}

/** 1:1 and 4:5, with a photograph above a navy information band. */
function BandedCard({ input, format }: { input: SocialCardInput; format: SocialCardFormat }) {
  const spec = SOCIAL_CARD_FORMATS[format]
  const px = scaler(format)
  const pad = px(56)
  // Width the QR block takes out of the band: the tile plus its gutter.
  const qrReserve = px(126) + px(20) + px(34)
  const image = (input.cover as { image: string }).image

  return (
    <div
      style={{
        width: spec.width,
        height: spec.height,
        display: 'flex',
        flexDirection: 'column',
        background: NAVY,
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: spec.width,
          height: spec.photoHeight,
        }}
      >
        <img
          src={image}
          alt=""
          width={spec.width}
          height={spec.photoHeight}
          style={{ width: spec.width, height: spec.photoHeight }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'linear-gradient(to bottom, rgba(10,22,40,0.66) 0%, rgba(10,22,40,0.18) 24%, rgba(10,22,40,0) 46%)',
          }}
        />
        <div style={{ position: 'absolute', left: pad, top: pad, display: 'flex' }}>
          <Eyebrow text={input.eyebrow} px={px} />
        </div>
      </div>

      {/* One gold hairline, the same device as the A4 poster. */}
      <div style={{ display: 'flex', width: spec.width, height: px(7), background: GOLD }} />

      {/* The QR is positioned, not flowed. A long title or a long ticket line
          has a min-content width the renderer will not shrink below, and in a
          plain row that pushes the tile off the right edge of the card. */}
      <div style={{ display: 'flex', flexGrow: 1, padding: pad, background: GROUND, position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: spec.width - pad * 2 - (input.qr ? qrReserve : 0),
            justifyContent: 'space-between',
            gap: px(16),
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: px(15) }}>
            <Identity input={input} px={px} size="sm" />
            <Title input={input} px={px} format={format} />
            <MetaLines input={input} px={px} size="sm" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: px(14) }}>
            <TicketBar input={input} px={px} size="sm" />
            <Wordmark px={px} size={px(20)} />
          </div>
        </div>
        {input.qr ? (
          <div style={{ position: 'absolute', right: pad, bottom: pad, display: 'flex' }}>
            <QrTile qr={input.qr} px={px} size={px(126)} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Render one card. Returns JPEG bytes: every destination accepts JPEG, it is
 * what keeps a photographic card inside the 5 MB ceiling LinkedIn and X both
 * publish, and it is what an organiser on a phone can actually upload at
 * eleven at night.
 */
export async function renderSocialCard(
  format: SocialCardFormat,
  input: SocialCardInput,
): Promise<Uint8Array> {
  const spec = SOCIAL_CARD_FORMATS[format]
  const fonts = await loadCardFonts()

  const element = !input.cover
    ? TypographicCard({ input, format })
    : format === 'story'
      ? StoryCard({ input })
      : BandedCard({ input, format })

  const response = new ImageResponse(element, {
    width: spec.width,
    height: spec.height,
    fonts: fonts.map(font => ({
      name: font.name,
      data: font.data,
      weight: font.weight,
      style: font.style,
    })),
  })

  const png = Buffer.from(await response.arrayBuffer())
  const { default: sharp } = await import('sharp')
  const jpeg = await sharp(png).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer()

  if (jpeg.byteLength > SOCIAL_CARD_MAX_BYTES) {
    // Only reachable with an extreme photograph; step the quality down rather
    // than hand back a file a platform will reject.
    const smaller = await sharp(png).jpeg({ quality: 72 }).toBuffer()
    return new Uint8Array(smaller)
  }
  return new Uint8Array(jpeg)
}

/**
 * Prepare a cover photograph for one card shape.
 *
 * Banded formats crop to a shallow region with sharp's attention strategy,
 * which weights luminance frequency, colour saturation and skin tone, so the
 * busy part of the frame survives a small crop.
 *
 * The story is the hard case and gets the panel rule: a photograph already
 * close to 9:16 bleeds to the full frame, anything wider is placed whole over
 * a blurred, dimmed copy of itself. EXIF orientation is applied first, because
 * phone uploads carry it.
 */
export async function prepareCardCover(
  bytes: Uint8Array,
  format: SocialCardFormat,
): Promise<PreparedCover | null> {
  try {
    const { default: sharp } = await import('sharp')
    const source = sharp(Buffer.from(bytes)).rotate()
    const meta = await source.metadata()
    const box = photoBox(format)

    if (format !== 'story') {
      const out = await source
        .clone()
        .resize(box.width, box.height, { fit: 'cover', position: sharp.strategy.attention })
        .jpeg({ quality: 88 })
        .toBuffer()
      return { kind: 'bleed', image: `data:image/jpeg;base64,${out.toString('base64')}` }
    }

    const width = meta.width ?? 0
    const height = meta.height ?? 0
    const ratio = width > 0 && height > 0 ? width / height : 1
    if (ratio <= STORY_PANEL_RATIO_THRESHOLD) {
      const out = await source
        .clone()
        .resize(box.width, box.height, { fit: 'cover', position: sharp.strategy.attention })
        .jpeg({ quality: 88 })
        .toBuffer()
      return { kind: 'bleed', image: `data:image/jpeg;base64,${out.toString('base64')}` }
    }

    const panelHeight = Math.min(STORY_PANEL_MAX_HEIGHT, Math.round(box.width / (ratio || 1)))
    const panel = await source
      .clone()
      .resize(box.width, panelHeight, { fit: 'cover', position: sharp.strategy.attention })
      .jpeg({ quality: 88 })
      .toBuffer()
    return {
      kind: 'panel',
      image: `data:image/jpeg;base64,${panel.toString('base64')}`,
      panelHeight,
    }
  } catch {
    // An unreadable or corrupt upload falls back to the typographic
    // composition rather than failing the download.
    return null
  }
}

/** Square an organiser logo onto a white tile, ready to sit on the navy. */
export async function prepareLogo(bytes: Uint8Array): Promise<string | null> {
  try {
    const { default: sharp } = await import('sharp')
    const out = await sharp(Buffer.from(bytes))
      .rotate()
      .resize(240, 240, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer()
    return `data:image/png;base64,${out.toString('base64')}`
  } catch {
    return null
  }
}
