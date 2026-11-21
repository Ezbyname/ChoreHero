// src/screens/RecoveryLinkExpiredScreen.tsx
import React from 'react';
import { Text } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { FormScreen } from '@/components/ui/FormScreen';
import { copy } from '@/content/copy';

// Shown when AppBootstrap classifies this tab's URL as an auth-redirect
// error (expired, invalid, or already-used recovery link — see
// authRedirectDetection.ts). Previously such a link silently fell through
// to a normal app boot with no explanation; this is the fix.
//
// This screen renders inside AppBootstrap's early-return branch, the same
// place EmailConfirmedScreen does — there is no NavigationContainer/
// AuthStack mounted yet at this point, so it cannot use react-navigation's
// navigate(). `onRequestNewLink` is a local AppBootstrap state transition
// into its recovery-mode ForgotPasswordScreen — deliberately NOT the
// generic "exit recovery" mechanism (useAuthRecoveryExit): that mechanism
// falls through to whatever the current auth state happens to be, which on
// a device with an existing valid session silently skipped straight to the
// authenticated app instead of ever showing a request-a-new-link form —
// a real bug this fixes. "Request a new link" must always mean requesting
// a new link, independent of whether a session happens to already exist.
export function RecoveryLinkExpiredScreen({ onRequestNewLink }: { onRequestNewLink: () => void }) {
  return (
    <FormScreen title={copy.auth.recoveryLinkExpiredTitle} subtitle={copy.auth.recoveryLinkExpiredBody} hero={<Text style={hero}>⏳</Text>}>
      <AppButton label={copy.auth.forgotPasswordLink} onPress={onRequestNewLink} />
    </FormScreen>
  );
}

const hero = { fontSize: 48 } as const;
