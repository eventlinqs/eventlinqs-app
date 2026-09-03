/* eslint-disable @next/next/no-img-element -- satori rasterises this tree
   itself inside an ImageResponse; next/image is a browser-side component and
   has no meaning here. The shipped link card at
   src/app/events/[slug]/opengraph-image.tsx carries the same exemption. */
import { renderCardPng } from '@/lib/broadcast/card-raster'
import { BODY_FAMILY, DISPLAY_FAMILY, loadCardFonts } from '@/lib/broadcast/card-fonts'
import { bodyTextMeasurer, displayTextMeasurer } from '@/lib/broadcast/card-metrics'
import { printableHost } from '@/lib/site-url'
import {
  SOCIAL_CARD_FORMATS,
  SOCIAL_CARD_MAX_BYTES,
  type SocialCardFormat,
} from '@/lib/broadcast/social-card-spec'
import {
  STORY_PANEL_MAX_HEIGHT,
  STORY_PANEL_MIN_HEIGHT,
  STORY_PANEL_RATIO_THRESHOLD,
  fitDisplayTitle,
  fitTicketBar,
  fitTitle,
  photoBox,
  storyStrapline,
  ticketBarText,
  type DisplayTitleFit,
} from '@/lib/broadcast/social-card-layout'
import { captureException } from '@/lib/observability/sentry'

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
  | { kind: 'panel'; image: string; backdrop: string; panelHeight: number }

/**
 * A prepared organiser logo. The placement is measured, not guessed: see
 * resolveLogoPlacement in src/lib/media/logo-pipeline.ts. A mark with light in
 * it sits straight on the navy; a dark mark gets a white tile so it does not
 * disappear into the artwork.
 */
export type PreparedLogo = {
  image: string
  placement: 'on-navy' | 'on-tile'
  /** Width over height, so a landscape wordmark is never squashed square. */
  aspect: number
}

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
  /** The organiser's own mark, when they have uploaded one. */
  organiserLogo?: PreparedLogo | null
  /** The prepared cover photograph, or null for the typographic composition. */
  cover?: PreparedCover | null
  /** Data URI of the tracked QR code. */
  qr?: string | null
  /** The organiser's own summary. One line of it rides the story card. */
  summary?: string | null
}

/** One set of numbers, scaled to the format width. */
function scaler(format: SocialCardFormat) {
  const s = SOCIAL_CARD_FORMATS[format].width / 1080
  return (n: number) => Math.round(n * s)
}

type Px = (n: number) => number

function Identity({ input, px, size }: { input: SocialCardInput; px: Px; size: 'lg' | 'sm' }) {
  const large = size === 'lg'
  const logo = input.organiserLogo
  // Fit to a height, not a box: a square badge and a landscape wordmark are
  // both legitimate marks and neither is squashed into the other's shape.
  const tile = logo?.placement === 'on-tile'
  const tilePad = px(large ? 12 : 9)
  // The tile's padding is taken OUT of the mark, not added to the row. Adding
  // it pushed the whole band down and clipped the wordmark off the bottom of
  // the card, which is what the first render did.
  const maxHeight = px(large ? 78 : 50) - (tile ? tilePad * 2 : 0)
  const maxWidth = px(large ? 300 : 200) - (tile ? tilePad * 2 : 0)
  let logoHeight = maxHeight
  let logoWidth = Math.round(maxHeight * (logo?.aspect ?? 1))
  if (logoWidth > maxWidth) {
    logoWidth = maxWidth
    logoHeight = Math.round(maxWidth / (logo?.aspect ?? 1))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: px(large ? 22 : 16) }}>
      {logo ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            ...(tile
              ? {
                  background: WHITE,
                  borderRadius: px(large ? 14 : 10),
                  padding: tilePad,
                }
              : {}),
          }}
        >
          {/* flexShrink on the image itself, not only the wrapper. Without it
              the row squeezed the mark and the renderer CLIPPED rather than
              scaled: the first render printed "BASEMEN1". */}
          <img
            src={logo.image}
            alt=""
            width={logoWidth}
            height={logoHeight}
            style={{ width: logoWidth, height: logoHeight, flexShrink: 0, objectFit: 'contain' }}
          />
        </div>
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

/**
 * The fitted headline of the artwork-free composition.
 *
 * SEPARATE FROM `Title` ON PURPOSE. `Title` is what the photograph
 * compositions draw, and those were required to render identically before and
 * after this change, so they keep their component and their ladder untouched.
 * This one draws a pre-fitted result instead.
 *
 * Each line is its own element with `whiteSpace: nowrap`, so the renderer is
 * never asked to wrap. The line breaks are the ones the fitter measured, which
 * is what stops the drawn block being a different height from the box it was
 * fitted to.
 */
function DisplayTitle({ fit, px }: { fit: DisplayTitleFit; px: Px }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {fit.lines.map((line, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            height: fit.leading,
            alignItems: 'center',
            color: WHITE,
            fontFamily: DISPLAY_FAMILY,
            fontWeight: 800,
            fontSize: fit.fontSize,
            letterSpacing: px(-1.5),
            whiteSpace: 'nowrap',
          }}
        >
          {line}
        </div>
      ))}
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

/** One line of the organiser's own words, story format only. */
function Strapline({ input, px }: { input: SocialCardInput; px: Px }) {
  const line = storyStrapline(input.summary)
  if (!line) return null
  return (
    <div
      style={{
        display: 'flex',
        color: 'rgba(255,255,255,0.72)',
        fontFamily: BODY_FAMILY,
        fontWeight: 500,
        fontSize: px(31),
        lineHeight: 1.32,
        marginTop: px(6),
      }}
    >
      {line}
    </div>
  )
}

/**
 * The body-face width measurer, warmed by renderSocialCard before it builds the
 * element tree, because satori's tree is built synchronously and the font has
 * to be parsed to measure anything. Assigning the same idempotent function from
 * concurrent renders on a warm instance is harmless; until the first warm-up it
 * falls back to the old per-character estimate.
 */
let measureBody: (text: string, fontSize: number) => number = (text, fontSize) =>
  text.length * fontSize * 0.52

function TicketBar({
  input,
  px,
  size,
  width,
}: {
  input: SocialCardInput
  px: Px
  size: 'lg' | 'sm'
  /** Outer width the bar must fit inside, so the line never wraps. */
  width: number
}) {
  const large = size === 'lg'
  const oneLineHeight = px(large ? 106 : 76)
  const padding = px(large ? 42 : 32)
  // printableHost, not the deployment host: a story card is posted publicly.
  const line = ticketBarText(input.priceLabel, input.shortUrl, printableHost())
  // Measured against the real face, and guaranteed to fit. `fit.lines` is what
  // gets drawn, never the input.
  const fit = fitTicketBar(
    line,
    width - padding * 2,
    px(large ? 38 : 30),
    px(large ? 24 : 20),
    measureBody,
  )
  const { lines, fontSize } = fit

  // THE ONE-LINE CASE IS THE ORIGINAL ELEMENT, unchanged. Not an equivalent
  // rewrite that ought to render the same: the same tree, so every card the
  // platform prints today is untouched by this change. Every address the
  // canonical host produces takes this branch.
  if (lines.length === 1) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width,
          height: oneLineHeight,
          borderRadius: oneLineHeight / 2,
          background: GOLD,
          padding: `0 ${padding}px`,
          color: NAVY,
          fontFamily: BODY_FAMILY,
          fontWeight: 600,
          fontSize,
          whiteSpace: 'nowrap',
        }}
      >
        {lines[0]}
      </div>
    )
  }

  // TWO ROWS. Only reachable on an address no permitted size holds on one line,
  // where the alternative used to be cutting it. The bar grows to hold the
  // address rather than the address shrinking to fit the bar.
  const rowHeight = Math.round(fontSize * 1.24)
  const height = rowHeight * lines.length + px(large ? 34 : 26)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width,
        height,
        borderRadius: px(large ? 32 : 24),
        background: GOLD,
        padding: `0 ${padding}px`,
        color: NAVY,
        fontFamily: BODY_FAMILY,
        fontWeight: 600,
        fontSize,
      }}
    >
      {lines.map((row, index) => (
        <div
          key={index}
          style={{ display: 'flex', height: rowHeight, alignItems: 'center', whiteSpace: 'nowrap' }}
        >
          {row}
        </div>
      ))}
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
 * The clear air between the ticket bar and the QR tile, in design units.
 *
 * Was 30, which at card scale put the pill about thirty pixels off the QR on the
 * square and read as a collision rather than as a pair (founder walk,
 * 13 August 2026). One constant, so the three shapes cannot drift apart again:
 * the story, the square and the tall post all reserve the same air and the
 * scaler turns it into the right number of pixels for each.
 *
 * The photograph composition below keeps its own reserve untouched. That path
 * renders identically before and after this change by instruction.
 */
const CTA_QR_GUTTER = 40

/**
 * No photograph: a full-frame typographic composition from the organiser's own
 * details. One layout, every format.
 *
 * THE DEAD VOID, AND WHY IT WAS THERE (founder walk, 13 August 2026). This laid
 * out three blocks with two `marginTop: 'auto'` margins, which does split the
 * spare height evenly, and that was the whole problem: on the 1440 x 1800 tall
 * post the type only came to about six hundred pixels, so "evenly" meant two
 * voids of five hundred pixels each. A third of the card was empty navy between
 * the venue line and the call to action, with a second hole above the headline.
 * The square and the story carried smaller versions of the same thing. Nothing
 * was broken; there was simply not enough composition to fill the frame.
 *
 * The fix is not more spacing rules, it is more composition: the headline is
 * fitted to the box it is given, so with no artwork the TYPE becomes the
 * artwork. That is what the A4 poster already does, and it is why the poster
 * reads as designed while this read as a template with a gap. A short name now
 * grows until it spans the card; a long one steps down and takes more lines.
 *
 * Law 6 is untouched and is the reason this is the fix: nothing is generated to
 * fill the hole. The words are the organiser's own and the composition is
 * deterministic.
 *
 * The design language is unchanged, deliberately: same navy ground, same gold
 * eyebrow chip, same Archivo headline, same QR bottom right, same Ticketing by
 * EVENTLINQS lockup, same dimensions. Only the scale of the type and the
 * distribution of the air are different.
 */
function TypographicCard({
  input,
  format,
  measureDisplay,
}: {
  input: SocialCardInput
  format: SocialCardFormat
  measureDisplay: (text: string, fontSize: number) => number
}) {
  const spec = SOCIAL_CARD_FORMATS[format]
  const px = scaler(format)
  const story = format === 'story'
  const pad = px(story ? 76 : 60)
  const size = story ? 'lg' : 'sm'
  const qrSize = px(story ? 140 : 126)
  const ctaTextWidth =
    spec.width - pad * 2 - (input.qr ? qrSize + px(20) + px(CTA_QR_GUTTER) : 0)

  const contentWidth = spec.width - pad * 2
  const contentHeight =
    spec.height - Math.max(spec.safeTop, pad) - Math.max(spec.safeBottom, pad)

  /*
   * The headline's box, measured from the blocks that surround it rather than
   * guessed. These are the heights the components below actually draw, so the
   * headline can be given everything that is left and the frame fills without
   * anything overlapping.
   */
  const identityHeight = px(story ? 78 : 50) + px(story ? 24 : 18) + px(story ? 58 : 52)
  const metaHeight = px(story ? 38 : 30) + px(story ? 34 : 27) + px(story ? 9 : 5)
  const straplineHeight = story && storyStrapline(input.summary) ? px(31 * 1.32 + 6) : 0
  const ctaHeight = input.qr
    ? px(story ? 140 : 126) + px(20) + px(story ? 9 : 9) + px(story ? 17 : 17) + px(20)
    : px(story ? 106 : 76) + px(story ? 18 : 14) + px(story ? 24 : 20)
  const ruleHeight = px(8)
  const gaps = px(story ? 28 : 20) * 2

  /*
   * THE HEADLINE IS CAPPED, and the cap is the difference between a poster and
   * a wall of type.
   *
   * Handed the whole of the leftover height, the fitter does exactly what it is
   * asked and fills it: the first render of this fix set "Screen Printing for
   * Beginners" at about 250 pixels across four lines and used ninety per cent of
   * a 1440 x 1800 card, which trades one defect for its opposite. A headline
   * needs air around it to read as a headline.
   *
   * So the box is the SMALLER of what is left and a share of the frame. The
   * story takes a smaller share because it also carries a line of the
   * organiser's own words underneath and its frame is the tallest.
   */
  const titleShare = story ? 0.38 : 0.46
  // A floor, so a pathological set of inputs can only ever make the headline
  // small rather than negative.
  const titleBox = Math.max(
    Math.min(
      contentHeight - identityHeight - metaHeight - straplineHeight - ctaHeight - ruleHeight - gaps,
      contentHeight * titleShare,
    ),
    px(120),
  )

  const fit = fitDisplayTitle(
    input.title,
    {
      maxWidth: contentWidth,
      maxHeight: titleBox,
      // Four lines. The A4 poster allows six because a page is taller than it is
      // wide and carries less around the headline; on a card a fifth line stops
      // being a headline whatever size it is set at.
      maxLines: 4,
      // The ceiling is the BOX, not a hand-picked point size: a single line can
      // be at most the box height and still fit, and anything narrower is bound
      // by the WIDTH instead. That bound is what makes a short name grow until
      // it spans the card, which is the whole point of the composition.
      max: titleBox / 1.06,
      min: px(story ? 44 : 34),
    },
    measureDisplay,
  )

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

        {/* The headline block takes the room, and centres in whatever is left
            over, so any residual air sits above AND below it rather than
            pooling into one hole under the venue line. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            justifyContent: 'center',
            gap: px(story ? 28 : 20),
          }}
        >
          <div style={{ display: 'flex', width: px(140), height: ruleHeight, background: GOLD }} />
          <DisplayTitle fit={fit} px={px} />
          <MetaLines input={input} px={px} size={size} />
          {story ? <Strapline input={input} px={px} /> : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: px(CTA_QR_GUTTER) }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: ctaTextWidth,
              gap: px(story ? 18 : 14),
            }}
          >
            <TicketBar input={input} px={px} size={size} width={ctaTextWidth} />
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

  // PANEL MODE: the photograph is shown whole at the top of the frame. Below it
  // the same photograph, blurred and dimmed, carries the type region, so the
  // lower half of a story is atmosphere rather than a flat navy hole. The
  // first version of this left roughly a third of the frame visibly empty.
  if (panel) {
    return (
      <div
        style={{
          width: spec.width,
          height: spec.height,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: NAVY,
        }}
      >
        <img
          src={panel.backdrop}
          alt=""
          width={spec.width}
          height={spec.height}
          style={{ position: 'absolute', inset: 0, width: spec.width, height: spec.height }}
        />
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
            padding: `${px(46)}px ${px(76)}px ${spec.safeBottom}px`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: px(20) }}>
            <Identity input={input} px={px} size="lg" />
            <Eyebrow text={input.eyebrow} px={px} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: px(20), marginTop: 'auto' }}>
            <Title input={input} px={px} format="story" />
            <MetaLines input={input} px={px} size="lg" />
            <Strapline input={input} px={px} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: px(30), marginTop: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: ctaTextWidth, gap: px(18) }}>
              <TicketBar input={input} px={px} size="lg" width={ctaTextWidth} />
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
        <Strapline input={input} px={px} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: px(30), marginTop: px(6) }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: ctaTextWidth, gap: px(18) }}>
            <TicketBar input={input} px={px} size="lg" width={ctaTextWidth} />
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
            <TicketBar input={input} px={px} size="sm" width={spec.width - pad * 2 - (input.qr ? qrReserve : 0)} />
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
/**
 * The composition, as a tree, before anything rasterises it.
 *
 * EXTRACTED so the parity check can render the SAME element through both
 * rasterisers. Rebuilding the tree in the test would compare the new path
 * against a COPY of the composition, and a copy that drifted would let a real
 * layout change pass as identical, which is precisely what the check exists to
 * prevent.
 */
export async function buildCardElement(
  format: SocialCardFormat,
  input: SocialCardInput,
): Promise<React.ReactElement> {
  // Warm both measurers before the (synchronous) tree is built, so the ticket
  // bar and the fitted headline are measured against real glyph widths rather
  // than an average. The display face is only needed by the artwork-free
  // composition, but it is resolved here because the tree cannot await.
  const [body, display] = await Promise.all([bodyTextMeasurer(), displayTextMeasurer()])
  measureBody = body

  return !input.cover
    ? TypographicCard({ input, format, measureDisplay: display })
    : format === 'story'
      ? StoryCard({ input })
      : BandedCard({ input, format })
}

export async function renderSocialCard(
  format: SocialCardFormat,
  input: SocialCardInput,
): Promise<Uint8Array> {
  const spec = SOCIAL_CARD_FORMATS[format]
  const fonts = await loadCardFonts()
  const element = await buildCardElement(format, input)

  /*
   * RASTERISED BY US, THROUGH resvg, SINCE 29 AUGUST 2026.
   *
   * This was `new ImageResponse(...)` from next/og. ImageResponse rasterises by
   * handing satori's SVG to SHARP, and inside the Next server runtime that sharp
   * cannot decode SVG at all while its own format table reports that it can. All
   * eighteen card downloads answered 500 with a zero-byte body because of it.
   *
   * The composition above is UNCHANGED: same element, same fonts, same sizes.
   * Only the step that turns the SVG into pixels moved, to WebAssembly, which
   * has no native decoder to be missing in one runtime and present in another.
   * The full diagnosis is docs/verification/SOCIAL-CARD-500-ROOT-CAUSE.md, and
   * scripts/verify/card-raster-parity.mjs proves the two paths agree pixel for
   * pixel.
   */
  const png = Buffer.from(
    await renderCardPng(element, {
      width: spec.width,
      height: spec.height,
      fonts: fonts.map(font => ({
        name: font.name,
        data: font.data,
        weight: font.weight,
        style: font.style,
      })),
    }),
  )
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
 * Blur the photograph and lay the brand navy over it at a fixed opacity, so the
 * lower half of a story card is one deliberate surface made from the
 * organiser's own image rather than a flat void or a muddy wash.
 */
async function backdropTone(
  pipeline: import('sharp').Sharp,
  // The CONSTRUCTOR, not the module namespace. Under sharp 0.34's `export =` the
  // two were the same object, so `typeof import('sharp')` was callable. 0.35 ships
  // real ESM named exports, so the namespace is `{ default, ... }` and calling it
  // is a type error; the callers all pass the default export, which this names.
  sharpLib: typeof import('sharp').default,
  width: number,
  height: number,
): Promise<Buffer> {
  const blurred = await pipeline.blur(14).modulate({ saturation: 0.55 }).toBuffer()
  return sharpLib(blurred)
    .composite([
      {
        input: {
          create: {
            width,
            height,
            channels: 4,
            background: { r: 10, g: 22, b: 40, alpha: 0.88 },
          },
        },
        blend: 'over',
      },
    ])
    .jpeg({ quality: 66 })
    .toBuffer()
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

    // Natural height first, then clamped into the band the composition needs.
    // Below the floor the frame reads unfinished; above the cap the type stops
    // fitting. Growing to the floor trims width, where a landscape photograph
    // has slack, and the trim is attention-weighted.
    const natural = Math.round(box.width / (ratio || 1))
    const panelHeight = Math.min(
      STORY_PANEL_MAX_HEIGHT,
      Math.max(STORY_PANEL_MIN_HEIGHT, natural),
    )
    const [panel, backdrop] = await Promise.all([
      source
        .clone()
        .resize(box.width, panelHeight, { fit: 'cover', position: sharp.strategy.attention })
        .jpeg({ quality: 88 })
        .toBuffer(),
      // The backdrop is toned ENTIRELY in sharp. Two attempts at a CSS wash, a
      // multi-stop gradient and then a flat rgba, both composited far weaker
      // than the alpha they declared and left the photograph reading through
      // the type. Compositing a navy layer here is deterministic and can be
      // inspected as a file.
      backdropTone(
        source.clone().resize(Math.round(box.width / 3), Math.round(box.height / 3), {
          fit: 'cover',
          position: 'centre',
        }),
        sharp,
        Math.round(box.width / 3),
        Math.round(box.height / 3),
      ),
    ])
    return {
      kind: 'panel',
      image: `data:image/jpeg;base64,${panel.toString('base64')}`,
      backdrop: `data:image/jpeg;base64,${backdrop.toString('base64')}`,
      panelHeight,
    }
  } catch (error) {
    captureException(error, { where: 'lib/broadcast/social-cards:1039' })
    // An unreadable or corrupt upload falls back to the typographic
    // composition rather than failing the download.
    return null
  }
}

/**
 * Prepare an organiser logo for an artefact.
 *
 * The shape is preserved. The placement is MEASURED by compositing the mark
 * over the brand navy and reading the result, rather than asking the organiser
 * to check it themselves, which is what the category currently does.
 */
export async function prepareLogo(bytes: Uint8Array): Promise<PreparedLogo | null> {
  try {
    const { default: sharp } = await import('sharp')
    const source = Buffer.from(bytes)
    const meta = await sharp(source).metadata()
    const width = meta.width ?? 0
    const height = meta.height ?? 0
    if (width < 1 || height < 1) return null

    const { resolveLogoPlacement } = await import('@/lib/media/logo-pipeline')
    const measured = await resolveLogoPlacement(source)

    // Rendered at a generous fixed height; the card scales it down from there,
    // so one prepared object serves the story, the square and the tall post.
    const out = await sharp(source)
      .rotate()
      .resize(900, 300, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer()

    return {
      image: `data:image/png;base64,${out.toString('base64')}`,
      placement: measured.placement,
      aspect: width / height,
    }
  } catch (error) {
    captureException(error, { where: 'lib/broadcast/social-cards:1079' })
    // An unreadable mark is simply not drawn: the organiser's name in type is
    // already on the card and carries the identity on its own.
    return null
  }
}
