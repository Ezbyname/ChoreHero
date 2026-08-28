// Native variant (Metro-only — see passwordResetRedirect.ts). Resolves the
// current build's actual registered scheme (chorehero-dev / chorehero-qa /
// chorehero in a real build) via expo-linking's own createURL(), rather
// than hardcoding any one variant's scheme here.
import { createURL } from 'expo-linking';

export function getPasswordResetRedirectUrl(): string {
  return createURL('reset-password');
}
