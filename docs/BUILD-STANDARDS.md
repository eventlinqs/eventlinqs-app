# EventLinqs Build Standards

## Design Benchmark

Every UI, form, flow, validation, interaction, and error message built for EventLinqs must meet or exceed the standard of Ticketmaster, Eventbrite, and DICE. Before writing any component, mentally compare what you are about to build against what those platforms do. If your version is less smart, less intuitive, less polished, or less professional than theirs — you are not done. This is non-negotiable.

## Specific Standards

### Forms
- All date/time fields validate as full datetime units — date and time are never treated separately
- No form should ever accept logically impossible input (end before start, sale after event, negative prices, zero capacity)
- Every form field that has a logical relationship to another field must enforce that relationship with inline validation
- Error messages must be human-readable and specific — never "Something went wrong"
- Forms must block progression until all validation passes

### UI Responsiveness
- Every server action that writes data must trigger an immediate UI refresh — no manual page reloads ever required
- Loading states must be shown during all async operations
- Success/error feedback must appear instantly after every action

### Images
- Cover images show the full image (object-contain), never cropped, in the event form and on public event pages
- Event card thumbnails use object-cover with 16:9 aspect ratio for consistent grid layout

### Navigation
- Every feature must be discoverable through the navigation — no hidden pages accessible only via direct URL

### Data Integrity
- All server-side writes use the admin Supabase client (service role)
- All Supabase calls wrapped in try/catch with real error messages surfaced
- revalidatePath called after every successful write, AND router.refresh() called in client components

### Code Quality
- npm run build must pass with zero errors after every change
- No changes to unrelated files
- Follow existing patterns from previous modules for consistency

## Reference

This file must be read by Claude Code at the start of every build command. Every command will begin with: "Read docs/BUILD-STANDARDS.md before writing any code."
