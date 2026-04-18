'use client'

import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

export function PreviewForm() {
  return (
    <form
      className="max-w-md space-y-5"
      onSubmit={e => e.preventDefault()}
      noValidate
    >
      <FormField
        id="preview-email"
        label="Email address"
        type="email"
        placeholder="you@example.com"
        required
        autoComplete="email"
        helperText="We'll never share your email with anyone."
      />

      <FormField
        id="preview-password"
        label="Password"
        type="password"
        placeholder="Min. 8 characters"
        required
        helperText="Use a mix of letters, numbers, and symbols."
      />

      <FormField
        id="preview-fullname"
        label="Full name"
        type="text"
        placeholder="Your full name"
        required
        error="Please enter your full name."
      />

      <FormField
        id="preview-phone"
        label="Phone number"
        type="tel"
        placeholder="+61 4XX XXX XXX"
        required
        autoComplete="tel"
      />

      <Button type="submit" variant="primary" size="lg" className="w-full">
        Submit form
      </Button>
    </form>
  )
}
