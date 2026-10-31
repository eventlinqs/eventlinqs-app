/**
 * THE PLAIN NOTICE, AS A LETTER (gap 3, 31 October 2026). The organiser notices (event live, a sale, the payout and
 * money notices) were each drawn by their own copy of one shape: a heading, a few lines and one button. This is that
 * shape once, opening with the greeting and signing off (src/lib/email/letter.ts), with the same markup they used.
 */
import { escapeHtml } from './escape'
import { greetingHtml, greetingLine, signOffHtml, signOffText } from './letter'

export function renderNotice(input: {
  /** The person's name or first name; null gives 'Hi there,'. */
  name: string | null
  title: string
  lines: readonly string[]
  cta?: { label: string; url: string } | null
  /** A small note under the sign off, such as where to change how often these arrive. */
  footnote?: string | null
}): { html: string; text: string } {
  const { name, title, lines, cta, footnote } = input
  const text =
    [greetingLine(name), '', title, '', ...lines, ...(cta ? ['', `${cta.label}: ${cta.url}`] : [])].join('\n') +
    signOffText() +
    (footnote ? `\n\n${footnote}` : '')
  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1628">`,
    greetingHtml(name),
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>`,
    ...lines.map((l) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${escapeHtml(l)}</p>`),
    cta
      ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#0A1628;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${escapeHtml(cta.label)}</a></p>`
      : '',
    signOffHtml(),
    footnote ? `<p style="font-size:13px;line-height:1.5;margin:24px 0 0;color:#4a5568">${escapeHtml(footnote)}</p>` : '',
    `</div>`,
  ].join('')
  return { html, text }
}
