// Bare/Web variant. Web keeps today's exact resetPasswordForEmail() call —
// no redirectTo. Returning undefined here is provably equivalent to that:
// auth-js's request builder only sets the redirect_to query param when
// options.redirectTo is truthy (node_modules/@supabase/auth-js/dist/module/
// lib/fetch.js), so `{ redirectTo: undefined }` produces the identical
// outgoing request as omitting the option entirely.
export function getPasswordResetRedirectUrl(): string | undefined {
  return undefined;
}
