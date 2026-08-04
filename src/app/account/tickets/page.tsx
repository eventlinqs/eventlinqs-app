import { redirect } from 'next/navigation'

/**
 * /account/tickets - permanent redirect into the real ticket wallet.
 *
 * Launch-face finalisation 2026-07-12: this route was a stub whose copy
 * promised a wallet "with the next release" (a Law 1 placeholder on a
 * shipped surface) while the REAL wallet - QR codes, buyer seat moves,
 * ticket transfer - already lives at /tickets. One canonical wallet, one
 * route in.
 */
export default function AccountTicketsRedirect() {
  redirect('/tickets')
}
