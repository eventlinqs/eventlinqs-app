/**
 * THE BUYER'S DOCUMENT: a tax invoice when it can be, a receipt when it cannot.
 *
 * Every element on this panel is one of the numbered requirements in the
 * Australian Taxation Office's "Tax invoices" page
 * (https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices,
 * page last updated 25 August 2025, fetched 25 August 2026), and each is
 * commented with the number it satisfies so a future edit cannot quietly remove
 * one. The decision about WHETHER this is a tax invoice is made in
 * src/lib/tax/tax-invoice.ts, once, and the same function the tests and the
 * verification drive use.
 *
 * THE PANEL IS SERVER-RENDERED AND CARRIES NO TAX DETAILS INTO THE CLIENT. The
 * organiser's ABN and GST-registration flag are read privileged on the server
 * and collapsed into the finished document before it is sent, which is the same
 * precedent as the public event page's sale posture: read it privileged, decide
 * server side, send the decision.
 *
 * "A tax invoice doesn't need to be issued in paper form ... Any digital record
 * or document transmitted to the customer needs to contain all the required
 * information to be a valid tax invoice." A rendered page the buyer can print
 * or save satisfies that, and everything required is on it.
 */
import { lineTaxLabel, type TaxInvoice } from '@/lib/tax/tax-invoice'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
}

/**
 * THE ISSUE DATE IS PINNED TO AN AUSTRALIAN ZONE, not to whichever machine
 * rendered it.
 *
 * Caught by tests/unit/dashboard/no-clock-during-render.test.ts, which refuses a
 * date formatted without an explicit `timeZone` in a server-rendered component.
 * Two reasons, and the second is the one that matters here:
 *
 *   - a zone-less format hydrates differently on the server and the client;
 *   - "Date the invoice was issued" is ATO requirement 4, and an invoice whose
 *     date shifts by a day depending on which region served the page is a
 *     document that says two different things about a tax point.
 *
 * The seller is Australian, the platform is Australian, so the platform zone is
 * the answer. It is the same constant the event surfaces use.
 */
function issuedOn(date: Date) {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'long',
    timeZone: PLATFORM_TIME_ZONE,
  }).format(date)
}

export function TaxInvoicePanel({ invoice }: { invoice: TaxInvoice }) {
  return (
    <section
      className="mb-4 rounded-xl border border-ink-200 bg-white p-6"
      aria-label={invoice.documentTitle}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* REQUIREMENT 1: the document is intended to be a tax invoice. */}
        <h3 className="type-rail-heading text-ink-900">{invoice.documentTitle}</h3>
        <p className="text-sm text-ink-400">Order {invoice.orderNumber}</p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Sold by</p>
          {/* REQUIREMENT 2: the seller's identity. */}
          <p className="mt-1 text-sm font-medium text-ink-900">{invoice.sellerIdentity}</p>
          {/* REQUIREMENT 3: the seller's ABN. */}
          {invoice.sellerAbn ? (
            <p className="mt-1 text-sm text-ink-600">ABN {invoice.sellerAbn}</p>
          ) : null}
          <p className="mt-1 text-xs text-ink-400">{invoice.issuedBy}</p>
        </div>
        <div>
          {/* REQUIREMENT 4: the date the invoice was issued. */}
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Issued</p>
          <p className="mt-1 text-sm text-ink-900">{issuedOn(invoice.issuedAt)}</p>
          {/* REQUIREMENT 8: the buyer's identity, required at $1,000 or more.
              Shown whenever it is known, because a buyer expects their own name
              on their receipt regardless of the threshold. */}
          {invoice.buyerIdentity ? (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                Issued to
              </p>
              <p className="mt-1 text-sm text-ink-900">{invoice.buyerIdentity}</p>
            </>
          ) : null}
        </div>
      </div>

      {/* REQUIREMENT 5: a brief description of the items sold, including the
          quantity and the price. REQUIREMENT 7: the extent to which each sale is
          a taxable sale, marked per line rather than asserted once, because a
          mixed invoice "must clearly show which items are taxable". */}
      <table className="mt-6 w-full text-sm">
        <caption className="sr-only">Items on this {invoice.documentTitle.toLowerCase()}</caption>
        <thead>
          <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
            <th scope="col" className="pb-2 font-semibold">Description</th>
            <th scope="col" className="pb-2 text-right font-semibold">Qty</th>
            <th scope="col" className="pb-2 text-right font-semibold">Amount</th>
            {invoice.isTaxInvoice ? (
              <th scope="col" className="pb-2 text-right font-semibold">GST</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {invoice.lines.map((line, i) => (
            <tr key={`${line.description}-${i}`}>
              <td className="py-2 text-ink-900">{line.description}</td>
              <td className="py-2 text-right text-ink-600">{line.quantity}</td>
              <td className="py-2 text-right text-ink-900">
                {money(line.amountCents, invoice.currency)}
              </td>
              {invoice.isTaxInvoice ? (
                <td className="py-2 text-right text-ink-600">{lineTaxLabel(line)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 border-t border-ink-200 pt-4">
        <div className="flex justify-between">
          <span className="text-sm font-semibold text-ink-900">Total paid</span>
          <span className="text-sm font-bold text-ink-900">
            {money(invoice.totalCents, invoice.currency)}
          </span>
        </div>

        {/* REQUIREMENT 6: the GST amount payable. The ATO permits the short
            form ONLY "if the GST amount is exactly 1/11 of the total price",
            which is true when every PRICED line is taxable and false the moment
            one priced line is GST-free. A zero-priced comp line does not change
            it, because it contributes nothing to either side of the ratio.
            Both forms are here and the data decides between them. */}
        {invoice.isTaxInvoice ? (
          invoice.totalPriceIncludesGst ? (
            <p className="mt-2 text-sm text-ink-600">Total price includes GST</p>
          ) : (
            <div className="mt-2 flex justify-between text-sm text-ink-600">
              <span>GST included</span>
              <span>{money(invoice.gstCents, invoice.currency)}</span>
            </div>
          )
        ) : null}

        {invoice.isTaxInvoice && invoice.taxableExtent === 'part' ? (
          <p className="mt-2 text-xs text-ink-400">
            GST applies only to the lines marked Taxable above.
          </p>
        ) : null}

        {!invoice.isTaxInvoice ? (
          <p className="mt-3 text-xs text-ink-400">
            This is a receipt, not a tax invoice, because {invoice.notTaxInvoiceReason}.
          </p>
        ) : null}
      </div>
    </section>
  )
}
