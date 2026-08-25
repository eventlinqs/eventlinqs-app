/**
 * WHEN A RECEIPT IS A TAX INVOICE, AND WHAT IT MUST SAY.
 *
 * ============================================================================
 * THE REQUIREMENTS, VERBATIM FROM THE ATO
 * ============================================================================
 *
 * Not from memory (Law 7). Australian Taxation Office, "Tax invoices",
 * https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices
 * (page last updated 25 August 2025, fetched 25 August 2026):
 *
 *   "If a customer asks for a tax invoice, you must provide one within 28 days,
 *    unless it is for a sale of $82.50 (including GST) or less."
 *
 *   "Tax invoices for taxable sales of less than $1,000 must include enough
 *    information to clearly determine the following 7 details:
 *      Document is intended to be a tax invoice.
 *      Seller's identity.
 *      Seller's Australian business number (ABN).
 *      Date the invoice was issued.
 *      Brief description of the items sold, including the quantity (if
 *        applicable) and the price.
 *      GST amount (if any) payable - this can be shown separately or, if the
 *        GST amount is exactly 1/11 of the total price, as a statement which
 *        says, 'Total price includes GST.'
 *      Extent to which each sale on the invoice is a taxable sale."
 *
 *   "Tax invoices for sales of $1,000 or more also need to show the buyer's
 *    identity or ABN."
 *
 *   "A tax invoice doesn't need to be issued in paper form. For example, you
 *    can issue a tax invoice to a customer by emailing an invoice in portable
 *    document format (PDF) or other digital formats. Any digital record or
 *    document transmitted to the customer needs to contain all the required
 *    information to be a valid tax invoice."
 *
 *   "A tax invoice that includes taxable and non-taxable items, must clearly
 *    show which items are taxable."
 *
 *   "Special rules apply to tax invoices for transactions carried out through
 *    agents. For more information see GSTR 2000/37 Goods and services tax:
 *    agency relationships and the application of the law."
 *
 * ============================================================================
 * WHO THE SELLER IS, AND WHY IT IS NOT EVENTLINQS
 * ============================================================================
 *
 * CLAUDE.md, the locked fee structure: "EventLinqs is the organiser's limited
 * payment collection agent: the ORGANISER is the seller and remits GST on the
 * ticket price. EventLinqs deals with GST only on its OWN fee, and only once
 * GST-registered."
 *
 * So the seller on a ticket tax invoice is the ORGANISER, and EventLinqs issues
 * the document on their behalf. That is the agency case the ATO points at
 * GSTR 2000/37 for, and it is why the invoice names the organiser's identity
 * and the organiser's ABN, with EventLinqs named as the issuing agent rather
 * than as the supplier.
 *
 * ============================================================================
 * WHEN IT IS *NOT* A TAX INVOICE, WHICH MATTERS MORE THAN WHEN IT IS
 * ============================================================================
 *
 * A document that says "Tax invoice" while the seller is not registered for GST
 * is a false statement about a tax position, and it invites the buyer to claim
 * a GST credit that does not exist. So the document is a tax invoice ONLY when
 * the organiser has recorded a well-formed ABN AND declared they are registered
 * for GST AND the sale is taxable. Otherwise it stays a RECEIPT, says so, and
 * carries no GST line at all.
 *
 * A free ticket is never a taxable sale, so it is never a tax invoice either.
 */
import { formatAbn, isValidAbn } from './abn'

/** GST is 1/11 of a GST-inclusive price. */
export const GST_DIVISOR = 11

/** The organiser's tax identity, as recorded on their organisation. */
export interface SellerTaxDetails {
  /** The trading name shown across the platform. */
  name: string
  /** The registered entity name, when it differs from the trading name. */
  legalName?: string | null
  /** Eleven digits, unformatted, or null when none is recorded. */
  abn?: string | null
  /** The organiser's own declaration that they are registered for GST. */
  gstRegistered?: boolean | null
}

export interface InvoiceLine {
  description: string
  quantity: number
  /** GST-inclusive amount for the whole line, in cents. */
  amountCents: number
  /** False for a GST-free or input-taxed line, which must be shown as such. */
  taxable: boolean
}

export interface InvoiceInput {
  orderNumber: string
  issuedAt: Date
  currency: string
  lines: InvoiceLine[]
  /** GST-inclusive total the buyer paid, in cents. */
  totalCents: number
  buyerName?: string | null
  buyerEmail?: string | null
  seller: SellerTaxDetails
}

export interface TaxInvoice {
  /** ATO requirement 1: the document declares what it is. */
  documentTitle: 'Tax invoice' | 'Receipt'
  isTaxInvoice: boolean
  /** Why it is not one, for the surface to show the organiser rather than the buyer. */
  notTaxInvoiceReason: string | null
  /** ATO requirement 2. */
  sellerIdentity: string
  /** ATO requirement 3, formatted 2-3-3-3 as the register prints it. */
  sellerAbn: string | null
  /** ATO requirement 4. */
  issuedAt: Date
  /** ATO requirement 5. */
  lines: InvoiceLine[]
  /** ATO requirement 6, in cents. Zero when nothing on the invoice is taxable. */
  gstCents: number
  /**
   * ATO requirement 6, the permitted short form. True only when the GST is
   * EXACTLY one eleventh of the total, which is to say every line is taxable.
   */
  totalPriceIncludesGst: boolean
  /** ATO requirement 7: stated per line, and summarised here. */
  taxableExtent: 'all' | 'part' | 'none'
  /** ATO requirement 8, required at $1,000 or more. */
  buyerIdentity: string | null
  buyerIdentityRequired: boolean
  totalCents: number
  currency: string
  orderNumber: string
  /** The agent that issued it, named because EventLinqs is not the seller. */
  issuedBy: string
}

/** $1,000, the threshold at which the buyer's identity becomes required. */
export const BUYER_IDENTITY_THRESHOLD_CENTS = 100_000

/**
 * GST on a GST-inclusive amount: one eleventh, rounded to the nearest cent.
 *
 * The ATO's rounding rule for a single taxable sale: "the amount of GST should
 * be rounded to the nearest cent (rounding 0.5 cents upwards)".
 */
export function gstOnInclusiveCents(inclusiveCents: number): number {
  return Math.round(inclusiveCents / GST_DIVISOR)
}

export function buildTaxInvoice(input: InvoiceInput): TaxInvoice {
  const abnDigits = (input.seller.abn ?? '').replace(/\D/g, '')
  const hasValidAbn = isValidAbn(abnDigits)
  const registered = input.seller.gstRegistered === true
  const taxableLines = input.lines.filter(l => l.taxable && l.amountCents > 0)
  const anyTaxable = taxableLines.length > 0
  const allTaxable = anyTaxable && taxableLines.length === input.lines.filter(l => l.amountCents > 0).length

  let notTaxInvoiceReason: string | null = null
  if (!registered) {
    notTaxInvoiceReason = 'the organiser has not declared GST registration'
  } else if (!hasValidAbn) {
    notTaxInvoiceReason = 'the organiser has not recorded a valid ABN'
  } else if (!anyTaxable) {
    notTaxInvoiceReason = 'this sale has no taxable amount'
  }
  const isTaxInvoice = notTaxInvoiceReason === null

  /*
   * THE GST FIGURE IS PER TAXABLE LINE, NOT ON THE TOTAL, because a mixed
   * invoice must "clearly show which items are taxable" and one eleventh of a
   * total that includes a GST-free line would overstate the credit available.
   */
  const gstCents = isTaxInvoice
    ? taxableLines.reduce((sum, l) => sum + gstOnInclusiveCents(l.amountCents), 0)
    : 0

  const buyerIdentityRequired = input.totalCents >= BUYER_IDENTITY_THRESHOLD_CENTS
  const buyerIdentity = input.buyerName?.trim() || input.buyerEmail?.trim() || null

  return {
    documentTitle: isTaxInvoice ? 'Tax invoice' : 'Receipt',
    isTaxInvoice,
    notTaxInvoiceReason,
    sellerIdentity: input.seller.legalName?.trim() || input.seller.name,
    sellerAbn: hasValidAbn ? formatAbn(abnDigits) : null,
    issuedAt: input.issuedAt,
    lines: input.lines,
    gstCents,
    // The short form is only permitted when the GST really is exactly 1/11 of
    // the total. On a mixed invoice it is not, so the amount must be shown.
    totalPriceIncludesGst: isTaxInvoice && allTaxable && gstCents === gstOnInclusiveCents(input.totalCents),
    taxableExtent: !anyTaxable ? 'none' : allTaxable ? 'all' : 'part',
    buyerIdentity,
    buyerIdentityRequired,
    totalCents: input.totalCents,
    currency: input.currency,
    orderNumber: input.orderNumber,
    issuedBy: 'EventLinqs, as the seller’s limited payment collection agent',
  }
}

/**
 * What to print in the tax column beside one line.
 *
 * THREE ANSWERS, NOT TWO, and the third is why this is a function rather than a
 * ternary in the markup. A line priced at zero is not "GST-free": GST-free is a
 * specific classification the ATO applies to particular supplies (basic food,
 * most health and education), and printing it beside a comp ticket asserts a
 * tax status that is not true. A comp ticket carries no GST because there is
 * nothing to apply it to. That is "No charge".
 *
 * Found by the verification drive: a $0 guest-list line rendered as "GST-free"
 * beside two taxable lines, while the GST was still exactly one eleventh of the
 * total, because a zero line changes neither the tax nor the price. The
 * document was arithmetically right and semantically wrong.
 */
export function lineTaxLabel(line: InvoiceLine): 'Taxable' | 'GST-free' | 'No charge' {
  if (line.amountCents === 0) return 'No charge'
  return line.taxable ? 'Taxable' : 'GST-free'
}

/**
 * Every ATO requirement, checked against a built invoice.
 *
 * Exported so the surface, the tests and the verification drive all ask the
 * same question. Returns the requirements that are NOT met; an empty array is a
 * compliant tax invoice.
 */
export function missingTaxInvoiceRequirements(invoice: TaxInvoice): string[] {
  if (!invoice.isTaxInvoice) return []
  const missing: string[] = []
  if (invoice.documentTitle !== 'Tax invoice') missing.push('1. document is intended to be a tax invoice')
  if (!invoice.sellerIdentity) missing.push("2. seller's identity")
  if (!invoice.sellerAbn) missing.push("3. seller's ABN")
  if (!(invoice.issuedAt instanceof Date) || Number.isNaN(invoice.issuedAt.getTime())) {
    missing.push('4. date the invoice was issued')
  }
  if (invoice.lines.length === 0) missing.push('5. description of the items sold')
  for (const line of invoice.lines) {
    if (!line.description || line.quantity <= 0) {
      missing.push(`5. description, quantity and price for "${line.description || '(unnamed)'}"`)
    }
  }
  if (invoice.gstCents <= 0 && !invoice.totalPriceIncludesGst) missing.push('6. GST amount payable')
  if (invoice.taxableExtent === 'none') missing.push('7. extent to which each sale is a taxable sale')
  if (invoice.buyerIdentityRequired && !invoice.buyerIdentity) {
    missing.push("8. buyer's identity (required at $1,000 or more)")
  }
  return missing
}
