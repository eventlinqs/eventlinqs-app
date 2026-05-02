'use client'

import React, { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'onChange'> {
  id: string
  label: string
  helperText?: string
  error?: string
  multiline?: boolean
  rows?: number
  onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
}

/**
 * FormField - accessible, single-field primitive.
 *
 * - Label always rendered and linked via htmlFor
 * - Error text linked via aria-describedby
 * - Helper text linked via aria-describedby (when no error)
 * - Focus ring matches the Button focus ring (brand-accent)
 * - Red border + red helper text in error state
 *
 * Usage:
 *   <FormField
 *     id="email"
 *     label="Email address"
 *     type="email"
 *     required
 *     helperText="We'll never share your email."
 *     error="Please enter a valid email address."
 *     value={email}
 *     onChange={e => setEmail(e.target.value)}
 *   />
 */
export const FormField = forwardRef<HTMLInputElement | HTMLTextAreaElement, FormFieldProps>(
  function FormField({ id, label, helperText, error, required, className = '', multiline, rows, ...inputProps }, ref) {
    const helperId = `${id}-helper`
    const errorId  = `${id}-error`

    const describedBy = error ? errorId : helperText ? helperId : undefined

    const sharedClassName = [
      // Base
      'block w-full rounded-lg border px-4 text-base',
      'bg-[var(--surface-0)] text-[var(--text-primary)]',
      'placeholder:text-[var(--text-muted)]',
      // Transition - colors only (border, ring) not all properties
      'transition-colors duration-150 ease-out',
      // Normal border
      error
        ? 'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-2 focus:ring-[var(--color-error)]/20'
        : 'border-[var(--surface-2)] focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]/20',
      // Remove browser default outline - we use custom focus ring
      'focus:outline-none',
      // Disabled
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    ].filter(Boolean).join(' ')

    return (
      <div className="space-y-1.5">
        {/* Label - tints red when field is in error state */}
        <label
          htmlFor={id}
          className={[
            'block text-sm font-medium',
            error ? 'text-red-900' : 'text-[var(--text-primary)]',
          ].join(' ')}
        >
          {label}
          {required && (
            <span className="ml-1 text-[var(--color-error)] select-none" aria-hidden="true">
              *
            </span>
          )}
        </label>

        {/* Input or Textarea */}
        {multiline ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            id={id}
            required={required}
            rows={rows ?? 4}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            className={[sharedClassName, 'py-3 resize-y'].join(' ')}
            {...(inputProps as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            id={id}
            required={required}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            className={[sharedClassName, 'h-12'].join(' ')}
            {...inputProps}
          />
        )}

        {/* Error text - mt-1.5 from input, leading-tight */}
        {error && (
          <p id={errorId} role="alert" className="mt-1.5 text-sm leading-tight text-[var(--color-error)]">
            {error}
          </p>
        )}

        {/* Helper text - mt-1.5 from input, leading-tight (only shown when no error) */}
        {!error && helperText && (
          <p id={helperId} className="mt-1.5 text-sm leading-tight text-[var(--text-muted)]">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)
