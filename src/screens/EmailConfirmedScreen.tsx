import React from 'react';
import { Text } from 'react-native';
import { FormScreen } from '@/components/ui/FormScreen';
import { copy } from '@/content/copy';

// Shown when the app loads directly from a Supabase email-confirmation
// redirect (see hasAuthRedirectMarkers in AppBootstrap.tsx). This tab's
// session is incidental — the user signs in for real on whichever device
// they actually use ChoreHero from — so this deliberately does not boot
// the normal authenticated app flow.
export function EmailConfirmedScreen() {
  return (
    <FormScreen title={copy.auth.emailConfirmedTitle} subtitle={copy.auth.emailConfirmedBody} hero={<Text style={hero}>✅</Text>}>
      {null}
    </FormScreen>
  );
}

const hero = { fontSize: 48 } as const;
