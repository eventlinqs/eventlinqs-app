/**
 * WHAT'S ON IN <CITY>: THE NEWSLETTER'S ONE TEMPLATE (law 46, Lawal's design A of 21 November 2026, 04:15 to 04:25: "This
 * is what I want ... Implement all of this to the T"; the reference build is
 * C:\dev\EVIDENCE\EL-21NOV\nl-design\whats-on\build_a.py and its shots). PURE: the edition's data in, the email out
 * (subject, preview text, HTML, plain text). Email safe as the reference is: tables, inline styles, 640 wide, background
 * images with navy fallbacks, columns that stack on a phone, the phone's own crops through one media query.
 *
 * THE COPY GATE IS HERE, PER PICK, FAIL CLOSED (law 22 as amended: a failing piece is left out alone and never holds
 * another): a pick whose words carry a dash of any kind, an exclamation mark, a placeholder, the banned word outside its
 * own name, or a price line longer than a short label is never drawn (pickProblems). Titles pass the social engine's one
 * cleaner (campaign.ts cleanTitle). Every link carries utm_source=newsletter, utm_medium=email, the edition's id and its
 * slot. The footer's ABN is read from the voice policy (the founder's signature), never written here.
 */
import { cleanTitle } from '@/lib/social/campaign'
import { carriesBannedWord } from '@/lib/social/words'
import { readVoicePolicy } from '@/lib/outreach/voice-gate'
import { contactAddress } from '@/lib/email/sender'

export type NewsletterEdition = 'week' | 'weekend'

/** One event in a slot. `image` is the composed image's address (the page's own photograph or a licensed one). */
export type NlPick = {
  readonly slug: string
  readonly title: string
  /** The pill: 'Festival', 'Live music', 'Comedy'. */
  readonly categoryLabel: string | null
  readonly categorySlug: string | null
  /** 'Sat 21 Nov, 7:30pm', or a run's 'Sat 21 to Sun 22 Nov'. */
  readonly whenLabel: string
  readonly venue: string
  /** 'Free entry', 'Tickets at Bird's Basement', 'From $45': a short label, never a sentence. */
  readonly priceLabel: string
  readonly image: string | null
  readonly imageAlt: string
  /** A licensed stock picture standing for the night, never its own: labelled 'Illustrative photo' (law 46 (f)). */
  readonly illustrative?: boolean
}

export type WhatsOnInput = {
  readonly edition: NewsletterEdition
  /** 'weekend-melbourne-2026-11-21': the utm_campaign of every link. */
  readonly editionId: string
  readonly cityName: string
  readonly citySlug: string
  /** 'Sat 21 to Sun 22 Nov 2026'. */
  readonly datesLabel: string
  /** 'Sat 21 to Sun 22 Nov': the subject's dates, as Lawal's design titles it. */
  readonly subjectDates: string
  /** 'Melbourne & Surrounds'. */
  readonly areaLabel: string
  readonly heroImage: { readonly desktop: string; readonly mobile: string } | null
  readonly intro: string
  readonly featured: (NlPick & { readonly blurb: string | null; readonly featImage: { readonly desktop: string; readonly mobile: string } | null }) | null
  readonly highlights: readonly NlPick[]
  readonly free: NlPick | null
  readonly gem: NlPick | null
  /** A night in another city within a drive; its city is named in its line. */
  readonly drive: (NlPick & { readonly cityName: string }) | null
  readonly alerts: readonly NlPick[]
  readonly origin: string
  readonly unsubscribeUrl: string
  readonly manageUrl: string
  readonly referUrl: string
  /** The edition's web copy, opened by 'View in browser' (/newsletter/<edition>/<city>/<date>); none on the web copy itself. */
  readonly webUrl?: string | null
}

const NAVY = '#0A1628'
const GOLD = '#E8B738'
const GOLD_TEXT = '#6F5409'
const TINT = '#FBF1D3'
const INK = '#141B2B'
const MUTED = '#4A5466'
const LINE = '#E6E3DC'
const CANVAS = '#EFEDE8'
const WHITE = '#FFFFFF'
const PINK = '#D6336C'
const HEAD = "'Archivo','Arial Black',Arial,sans-serif"
const BODY = "'Manrope','Helvetica Neue',Helvetica,Arial,sans-serif"

/** The pill's colour by category, as the reference draws Festival, Live music and Comedy; anything else navy. */
const PILL: Readonly<Record<string, string>> = { festival: PINK, festivals: PINK, music: '#5B3FD0', 'live-music': '#5B3FD0', comedy: '#E8590C' }

const DASHES = /[\u2010-\u2015\u2212]|\s-\s|\s-$|^-\s/
const PLACEHOLDER = /\b(undefined|null|NaN|None|TBA|TBC|lorem ipsum)\b/
/** The longest price line that is still a label (the PM's 04:01: View Street's sentence was 80 characters). */
export const PRICE_LABEL_MAX = 32

/** Why a pick cannot be drawn, in words; empty when it can (law 22, the newsletter's own copy gate). */
export function pickProblems(p: NlPick): string[] {
  const out: string[] = []
  const words = [p.title, p.whenLabel, p.venue, p.priceLabel, p.categoryLabel ?? '', p.imageAlt]
  for (const w of words) {
    if (DASHES.test(w)) out.push(`a dash in '${w}'`)
    if (w.includes('!') && w !== p.title) out.push(`an exclamation mark in '${w}'`)
    if (PLACEHOLDER.test(w)) out.push(`a placeholder in '${w}'`)
  }
  if (carriesBannedWord(words.join(' '), [p.title, p.venue])) out.push('the banned word outside its own name')
  if (p.priceLabel.length > PRICE_LABEL_MAX) out.push(`a price line of ${p.priceLabel.length} characters is a sentence, not a label`)
  if (!p.title.trim() || !p.whenLabel.trim()) out.push('no title or no time')
  return out
}

const esc = (s: string | null | undefined): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * A URL INSIDE THE <style> ELEMENT (found by looking at the practice weekend editions, 21 November 2026, 14:44). A
 * <style> element's text is raw: its entities are never decoded, so esc()'s &amp; reached the image proxy as 'amp;src'
 * and every phone lost the city photograph. Here nothing is written as an entity; the characters that could end the
 * url('...') or the element itself are percent-encoded instead, which a URL reads as the same character.
 */
const cssUrl = (s: string | null | undefined): string =>
  String(s ?? '').replace(/['"\\()<>\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)

function utm(origin: string, path: string, editionId: string, slot: string): string {
  const [base, hash] = path.split('#')
  const q = new URLSearchParams({ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: editionId, utm_content: slot })
  return `${origin}${base}${base.includes('?') ? '&' : '?'}${q.toString()}${hash ? `#${hash}` : ''}`
}

function pill(text: string, bg: string, fg: string): string {
  return `<span style="display:inline-block;background:${bg};color:${fg};font:800 11px/14px ${BODY};letter-spacing:.06em;text-transform:uppercase;padding:5px 10px;border-radius:999px">${esc(text)}</span>`
}

function facts(rows: readonly (readonly [string, string])[], color = MUTED, size = 14): string {
  return rows
    .map(([icon, text]) => `<tr><td valign="top" width="24" style="padding:3px 0;font:400 ${size}px/20px ${BODY}">${icon}</td><td style="padding:3px 0;font:600 ${size}px/20px ${BODY};color:${color}">${esc(text)}</td></tr>`)
    .join('')
}

/** The label a licensed stock picture carries wherever it stands for a night (law 46 (f)). */
const ILLUSTRATIVE = `<div style="margin:0 0 6px 0"><span style="display:inline-block;background:rgba(10,22,40,.72);color:#FFFFFF;font:700 10px/12px ${BODY};letter-spacing:.04em;padding:3px 7px;border-radius:4px">Illustrative photo</span></div>`
const CAL = '\u{1F4C5}'
const PIN = '\u{1F4CD}'
const TICKET = '\u{1F39F}\u{FE0F}'

/** The title as every slot shows it: the one cleaner. */
const titleOf = (p: NlPick): string => cleanTitle(p.title)

/** Lawal's design's own title: "What's On in Melbourne this weekend, Sat 21 to Sun 22 Nov". */
function subjectOf(input: WhatsOnInput): string {
  return `What's On in ${input.cityName} this ${input.edition === 'weekend' ? 'weekend' : 'week'}, ${input.subjectDates}`
}

/** The edition, drawn. Picks that fail the copy gate are left out alone; the edition never invents one to fill a slot. */
export function buildWhatsOn(input: WhatsOnInput): { subject: string; preheader: string; html: string; text: string; leftOut: string[] } {
  const leftOut: string[] = []
  const keep = <T extends NlPick>(p: T | null, slot: string): T | null => {
    if (!p) return null
    const why = pickProblems(p)
    if (why.length > 0) {
      leftOut.push(`${slot} ${p.slug}: ${why.join('; ')}`)
      return null
    }
    return p
  }
  const featured = keep(input.featured, 'featured')
  const highlights = input.highlights.map((p, i) => keep(p, `h${i + 1}`)).filter((p): p is NlPick => p !== null).slice(0, 3)
  const free = keep(input.free, 'free')
  const gem = keep(input.gem, 'gem')
  const drive = keep(input.drive, 'drive')
  const alerts = input.alerts.map((p, i) => keep(p, `alert${i + 1}`)).filter((p): p is NlPick => p !== null).slice(0, 2)
  const link = (path: string, slot: string) => utm(input.origin, path, input.editionId, slot)
  const eventLink = (p: NlPick, slot: string) => link(`/events/${p.slug}`, slot)
  const weekendWord = input.edition === 'weekend' ? 'weekend' : 'week'

  // 'View in browser' (the PM's order of 21 November 2026, about 03:30): the edition's own web copy, above the masthead.
  const viewInBrowser = input.webUrl
    ? `\n<tr><td align="right" style="padding:8px 24px;background:#EFEDE8;font:500 12px/16px ${BODY};color:${MUTED}"><a href="${esc(input.webUrl)}" style="color:${MUTED};text-decoration:underline">View in browser</a></td></tr>`
    : ''
  const hero = `
<tr><td class="hero"${input.heroImage ? ` background="${esc(input.heroImage.desktop)}"` : ''} bgcolor="${NAVY}" style="background:${NAVY}${input.heroImage ? ` url('${esc(input.heroImage.desktop)}') right center / cover no-repeat` : ''};padding:30px 36px 30px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td><div style="font:800 24px/26px ${HEAD};letter-spacing:.02em;color:${WHITE}">EVENTLINQS<span style="color:${GOLD}">.</span></div><div style="width:84px;height:3px;background:${GOLD};border-radius:3px;margin-top:5px;font-size:0;line-height:0">&nbsp;</div></td>
<td align="right" valign="top" class="hide-m" style="font:600 13px/18px ${BODY};color:${WHITE}">Discover. Experience. Connect.</td></tr></table>
<div class="hero-h" style="font:800 46px/50px ${HEAD};color:${WHITE};margin-top:28px">What&#8217;s On in<br><span style="color:${GOLD}">${esc(input.cityName)}</span></div>
<div style="font:500 16px/23px ${BODY};color:#E3E7EE;margin-top:12px;max-width:330px">Your ${weekendWord} guide to the best events, festivals, music, comedy and more.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr>
<td class="block-m2" style="font:700 15px/20px ${BODY};color:${WHITE};padding-right:14px">${CAL}&nbsp; ${esc(input.datesLabel)}</td>
<td class="hide-m" style="font:400 15px/20px ${BODY};color:#7D8798;padding-right:14px">|</td>
<td class="block-m2" style="font:700 15px/20px ${BODY};color:${WHITE}">${PIN}&nbsp; ${esc(input.areaLabel)}</td></tr></table>
<div class="hero-space" style="height:0;font-size:0;line-height:0">&nbsp;</div>
</td></tr>`

  const strip = `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${[GOLD, PINK, '#5B3FD0', '#E8590C', '#12A58C']
    .map((c) => `<td height="6" bgcolor="${c}" style="height:6px;font-size:0;line-height:0">&nbsp;</td>`)
    .join('')}</tr></table></td></tr>`

  const intro = `<tr><td class="pad" style="padding:26px 32px 18px 32px;font:400 18px/27px ${BODY};color:${INK}"><b style="color:${NAVY}">Good morning.</b> ${esc(input.intro)}</td></tr>`

  let featuredRow = ''
  if (featured) {
    const href = eventLink(featured, 'featured')
    const text = `${pill(featured.categoryLabel ? `Featured ${featured.categoryLabel.toLowerCase()}` : 'Featured', GOLD, NAVY)}
<div style="font:800 32px/36px ${HEAD};color:${WHITE};margin-top:14px"><a href="${esc(href)}" style="color:${WHITE};text-decoration:none">${esc(titleOf(featured))}</a></div>
${featured.blurb ? `<div style="font:400 15px/22px ${BODY};color:#E3E7EE;margin-top:10px">${esc(featured.blurb)}</div>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px">${facts([[CAL, featured.whenLabel], [PIN, featured.venue], [TICKET, featured.priceLabel]], WHITE, 15)}</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr><td bgcolor="${GOLD}" style="border-radius:999px"><a href="${esc(href)}" style="display:inline-block;padding:14px 30px;font:800 17px/20px ${BODY};color:${NAVY};text-decoration:none;border-radius:999px">Plan your visit &rarr;</a></td></tr></table>`
    const img = featured.featImage
    featuredRow = `
<tr><td class="pad" style="padding:6px 24px 8px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="hide-m"><tr>
<td${img ? ` background="${esc(img.desktop)}"` : ''} bgcolor="${NAVY}" height="460" valign="middle" style="background:${NAVY}${img ? ` url('${esc(img.desktop)}') left center / cover no-repeat` : ''};height:460px;border-radius:18px;padding:0 30px">
<table role="presentation" width="58%" cellpadding="0" cellspacing="0" border="0"><tr><td>${featured.illustrative ? ILLUSTRATIVE : ''}${text}</td></tr></table></td></tr></table>
<!--[if !mso]><!--><div class="show-m" style="display:none;max-height:0;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${NAVY}" style="border-radius:18px;overflow:hidden">
${img ? `<tr><td style="padding:0"><a href="${esc(href)}"><img src="${esc(img.mobile)}" width="100%" alt="${esc(featured.imageAlt)}" style="display:block;width:100%;height:auto;border-radius:18px 18px 0 0"></a></td></tr>` : ''}
<tr><td style="padding:${img ? '4px' : '24px'} 22px 26px 22px">${featured.illustrative ? ILLUSTRATIVE : ''}${text}</td></tr></table></div><!--<![endif]-->
</td></tr>`
  }

  const card = (p: NlPick, slot: string): string => {
    const href = eventLink(p, slot)
    const bg = p.categorySlug ? (PILL[p.categorySlug] ?? '#13233D') : '#13233D'
    return `<div class="col3" style="display:inline-block;width:100%;max-width:190px;vertical-align:top;margin:0 3px 12px 3px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${WHITE}" style="border-radius:14px;border:1px solid ${LINE}">
<tr><td${p.image ? ` background="${esc(p.image)}"` : ''} bgcolor="${NAVY}" height="150" valign="bottom" style="background:${NAVY}${p.image ? ` url('${esc(p.image)}') center / cover no-repeat` : ''};height:150px;border-radius:14px 14px 0 0;padding:0 14px 12px 14px">
<a href="${esc(href)}" style="text-decoration:none;display:block" title="${esc(p.imageAlt)}">${p.illustrative ? ILLUSTRATIVE : ''}${p.categoryLabel ? pill(p.categoryLabel, bg, WHITE) : ''}
<div style="font:800 17px/21px ${HEAD};color:${WHITE};margin-top:6px">${esc(titleOf(p))}</div></a></td></tr>
<tr><td style="padding:12px 14px 14px 14px"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${facts([[CAL, p.whenLabel], [PIN, p.venue], [TICKET, p.priceLabel]], INK, 13)}</table>
<div style="margin-top:8px"><a href="${esc(href)}" style="font:800 14px/20px ${BODY};color:${NAVY};text-decoration:none">See details <span style="color:${GOLD}">&rarr;</span></a></div></td></tr></table></div>`
  }

  const highlightsRows =
    highlights.length === 0
      ? ''
      : `
<tr><td class="pad" bgcolor="#FFF4E6" style="background:#FFF4E6;padding:26px 32px 6px 32px"><div style="font:800 26px/32px ${HEAD};color:${NAVY}">More ${input.edition === 'weekend' ? 'Weekend' : 'Week'} Highlights</div><div style="width:44px;height:4px;background:${GOLD};border-radius:3px;margin-top:8px;font-size:0;line-height:0">&nbsp;</div></td></tr>
<tr><td class="pad" align="center" bgcolor="#FFF4E6" style="background:#FFF4E6;padding:14px 21px 12px 21px;font-size:0">
${highlights.map((p, i) => card(p, `h${i + 1}`)).join('\n')}
</td></tr>`

  const dot = ` <span style="color:${GOLD}">&bull;</span> `
  const mini = (icon: string, heading: string, p: NlPick, line: string, cta: string, slot: string, bg: string, edge: string): string => {
    const href = eventLink(p, slot)
    return `<div class="col3" style="display:inline-block;width:100%;max-width:190px;vertical-align:top;margin:0 3px 12px 3px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="border-radius:14px;border-top:5px solid ${edge}"><tr><td style="padding:16px 14px">
<div style="font:800 16px/22px ${HEAD};color:${NAVY};white-space:nowrap">${icon}&nbsp; ${esc(heading)}</div>
<div style="font:800 15px/20px ${BODY};color:${INK};margin-top:10px"><a href="${esc(href)}" style="color:${INK};text-decoration:none">${esc(titleOf(p))}</a></div>
<div style="font:500 14px/20px ${BODY};color:${MUTED};margin-top:3px">${line} <a href="${esc(href)}" style="color:${GOLD_TEXT};font-weight:800;text-decoration:none">${esc(cta)} &rarr;</a></div>
</td></tr></table></div>`
  }
  const panels = [
    free ? mini('\u{1F381}', `Free This ${input.edition === 'weekend' ? 'Weekend' : 'Week'}`, free, `${esc(free.whenLabel)}${dot}${esc(free.venue)}${dot}Free${dot}`, 'See details', 'free', '#E4F6EC', '#12A58C') : '',
    gem ? mini('\u{1F48E}', 'Hidden Gem', gem, `${esc(gem.whenLabel)}${dot}${esc(gem.venue)}${dot}`, 'Discover more', 'gem', '#EFE9FC', '#5B3FD0') : '',
    drive ? mini('\u{1F697}', 'Worth the Drive', drive, `${esc(drive.whenLabel)}${dot}${esc(drive.venue)}, ${esc(drive.cityName)}${dot}`, 'See details', 'drive', '#E6F0FB', '#2B6CB0') : '',
  ].filter((s) => s !== '')
  const panelsRow = panels.length === 0 ? '' : `\n<tr><td class="pad" align="center" style="padding:20px 21px 0 21px;font-size:0">\n${panels.join('\n')}\n</td></tr>`

  let alertRow = ''
  if (alerts.length > 0) {
    const named = alerts.map((p, i) => `<a href="${esc(eventLink(p, `alert${i + 1}`))}" style="color:${INK};font-weight:800">${esc(titleOf(p))}</a>`)
    const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`
    alertRow = `
<tr><td class="pad" style="padding:10px 24px 8px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${TINT}" style="border-radius:16px"><tr>
<td class="block-m" width="64" valign="middle" style="padding:20px 0 20px 22px;font:400 40px/44px ${BODY}">${TICKET}</td>
<td class="block-m" valign="middle" style="padding:18px 14px 18px 14px"><div style="font:800 24px/28px ${HEAD};color:${NAVY}">Ticket Alert</div>
<div style="font:500 15px/22px ${BODY};color:${INK};margin-top:4px">Just announced: ${list}. Grab your tickets early before they sell out.</div></td>
<td class="block-m" align="right" valign="middle" style="padding:18px 22px 18px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${NAVY}" style="border-radius:999px"><a href="${esc(link(`/city/${input.citySlug}#just-announced`, 'alert'))}" style="display:inline-block;padding:13px 22px;font:800 15px/18px ${BODY};color:${WHITE};text-decoration:none;border-radius:999px;white-space:nowrap">View ticket alerts &rarr;</a></td></tr></table></td>
</tr></table></td></tr>`
  }

  const guide = `
<tr><td class="pad" align="center" style="padding:14px 24px 6px 24px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${NAVY}" style="border-radius:999px"><a href="${esc(link(`/city/${input.citySlug}`, 'guide'))}" style="display:inline-block;padding:14px 28px;font:800 16px/20px ${BODY};color:${WHITE};text-decoration:none;border-radius:999px">See everything on in ${esc(input.cityName)} &rarr;</a></td></tr></table></td></tr>`

  const share = `
<tr><td class="pad" style="padding:10px 24px 22px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${NAVY}" style="border-radius:16px"><tr>
<td class="block-m" width="60" valign="middle" style="padding:20px 0 20px 22px;font:400 36px/40px ${BODY}">\u{1F465}</td>
<td class="block-m" valign="middle" style="padding:18px 14px"><div style="font:800 22px/28px ${HEAD};color:${WHITE}">Know someone who&#8217;d love this?</div>
<div style="font:500 14px/21px ${BODY};color:#D6DBE3;margin-top:4px">Share this newsletter and help them discover great events in ${esc(input.cityName)}.</div></td>
<td class="block-m" align="right" valign="middle" style="padding:18px 22px 18px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border:2px solid ${GOLD};border-radius:999px"><a href="${esc(input.referUrl)}" style="display:inline-block;padding:11px 20px;font:800 15px/18px ${BODY};color:${GOLD};text-decoration:none;white-space:nowrap">Share EventLinqs &rarr;</a></td></tr></table></td>
</tr></table></td></tr>`

  const abn = readVoicePolicy().firstSignature.find((l) => /^ABN\s/.test(l)) ?? ''
  const editionName = input.edition === 'weekend' ? 'The Weekend' : 'The Week'
  const footer = `
<tr><td class="pad" style="padding:6px 32px 30px 32px;font:500 13px/20px ${BODY};color:${MUTED}">You&#8217;re receiving ${editionName} from EventLinqs. &nbsp;<a href="${esc(input.manageUrl)}" style="color:${INK}">Manage preferences</a> &nbsp;|&nbsp; <a href="${esc(input.unsubscribeUrl)}" style="color:${INK}">Unsubscribe</a>
<div style="font:500 12px/18px ${BODY};color:#7A8291;margin-top:8px">EventLinqs${abn ? `, ${esc(abn)}` : ''}, Geelong VIC, Australia, ${esc(contactAddress('hello'))}. Event details come from organisers and venues; check times before you go.</div></td></tr>`

  const subject = subjectOf(input)
  const preheader = [featured, ...highlights].filter((p): p is NlPick => p !== null).slice(0, 3).map(titleOf).join(', ')
  const mobileHero = input.heroImage ? `.hero{background-image:url('${cssUrl(input.heroImage.mobile)}')!important;background-position:center bottom!important;padding:24px 20px 0 20px!important} .hero-space{height:300px!important}` : ''

  const html = `<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
img{border:0;display:block} a{color:${NAVY}} table{border-collapse:separate}
@media (max-width:660px){
 .wrap{width:100%!important} .pad{padding-left:16px!important;padding-right:16px!important}
 ${mobileHero} .hero-h{font-size:38px!important;line-height:42px!important}
 .block-m2{display:block!important;padding:3px 0!important}
 .hide-m{display:none!important} .show-m{display:block!important;max-height:none!important;overflow:visible!important}
 .col3{max-width:100%!important;margin:0 0 12px 0!important} .block-m{display:block!important;width:auto!important;text-align:left!important;padding:14px 20px 0 20px!important}
}
</style></head>
<body style="margin:0;padding:0;background:${CANVAS}">
<div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CANVAS}"><tr><td align="center">
<table role="presentation" class="wrap" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="${WHITE}" style="width:640px;max-width:640px">
${viewInBrowser}${hero}${strip}${intro}${featuredRow}${highlightsRows}${panelsRow}${alertRow}${guide}${share}${footer}
</table></td></tr></table></body></html>`

  const line = (p: NlPick, slot: string) => `${titleOf(p)}\n${p.whenLabel} | ${p.venue} | ${p.priceLabel}\n${eventLink(p, slot)}`
  const text = [
    ...(input.webUrl ? [`View in browser: ${input.webUrl}`, ''] : []),
    `What's On in ${input.cityName}`,
    input.datesLabel,
    '',
    `Good morning. ${input.intro}`,
    ...(featured ? ['', `FEATURED`, line(featured, 'featured')] : []),
    ...(highlights.length ? ['', `MORE ${input.edition === 'weekend' ? 'WEEKEND' : 'WEEK'} HIGHLIGHTS`, ...highlights.map((p, i) => line(p, `h${i + 1}`))] : []),
    ...(free ? ['', `FREE THIS ${input.edition === 'weekend' ? 'WEEKEND' : 'WEEK'}`, line(free, 'free')] : []),
    ...(gem ? ['', 'HIDDEN GEM', line(gem, 'gem')] : []),
    ...(drive ? ['', 'WORTH THE DRIVE', line(drive, 'drive')] : []),
    ...(alerts.length ? ['', 'TICKET ALERT', ...alerts.map((p, i) => line(p, `alert${i + 1}`))] : []),
    '',
    `See everything on in ${input.cityName}: ${link(`/city/${input.citySlug}`, 'guide')}`,
    '',
    `You're receiving ${editionName} from EventLinqs.`,
    `Manage preferences: ${input.manageUrl}`,
    `Unsubscribe: ${input.unsubscribeUrl}`,
    `EventLinqs${abn ? `, ${abn}` : ''}, Geelong VIC, Australia, ${contactAddress('hello')}.`,
  ].join('\n')

  return { subject, preheader, html, text, leftOut }
}
