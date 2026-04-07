import type { PaymentGateway } from './gateway'
import { StripeAdapter } from './stripe-adapter'

export function getPaymentGateway(gatewayName: string): PaymentGateway {
  switch (gatewayName) {
    case 'stripe':
      return new StripeAdapter()
    // Future: case 'paystack': return new PaystackAdapter()
    // Future: case 'flutterwave': return new FlutterwaveAdapter()
    // Future: case 'paypal': return new PayPalAdapter()
    default:
      throw new Error(`Unsupported payment gateway: ${gatewayName}`)
  }
}

export function getDefaultGateway(): PaymentGateway {
  return getPaymentGateway('stripe')
}
