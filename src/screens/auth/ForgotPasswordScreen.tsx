import React, { useState } from 'react';
import { Text } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { FormScreen } from '@/components/ui/FormScreen';
import { TextField } from '@/components/ui/TextField';
import { copy } from '@/content/copy';
import { isRateLimitError, sendPasswordResetEmail } from '@/services/supabase/auth';
import { useResendCooldown } from '@/lib/useResendCooldown';
import { resolveInitialEmail } from '@/lib/resolveInitialEmail';

// `onBack` is a plain callback rather than useNavigation() so this screen
// can be rendered both inside AuthStack's NavigationContainer (the normal
// case) and inside AppBootstrap's early-return recovery branch (N1.3
// corrective patch — "Request a new link" from an expired recovery link),
// which has no NavigationContainer mounted at all. See AuthStack.tsx for
// how the normal case supplies onBack, and AppBootstrap.tsx for the
// recovery-mode case.
//
// `initialEmail` (A1 — Recovery Email Prefill) is convenience only, never
// identity binding: AppBootstrap passes it only when a reliable current-
// session email already exists (selectAuthUserEmail — nothing derived from
// the recovery URL/token), and it seeds a plain, fully-editable useState —
// not synced on later re-renders. That's deliberately safe here, not an
// oversight: AppBootstrap's recovery branches never mount AuthBootstrap, so
// the store's authUser (and thus this value) cannot change while this
// screen is showing in recovery mode — this component mounts exactly once
// for that transition (a distinct element type replacing
// RecoveryLinkExpiredScreen at the same tree position), so there is no
// later value to sync to, and no risk of a useEffect silently overwriting
// something the user already typed.
//
// resolveInitialEmail itself lives in src/lib/resolveInitialEmail.ts, not
// here — Node's --experimental-strip-types test loader rejects .tsx files
// outright, so a pure helper needed by the plain Node test runner cannot
// live inside this .tsx screen file.

// Enumeration-safe by construction: the success state's copy
// (resetLinkSentTitle/Body) is shown identically whether or not the
// submitted email is actually registered — resetPasswordForEmail() itself
// never reveals this. A genuine request error (rate-limited, network,
// malformed input) is a separate, safe-to-show concern — see handleSend.
export function ForgotPasswordScreen({
  onBack,
  initialEmail,
}: {
  onBack: () => void;
  initialEmail?: string;
}) {
  const [email,        setEmail]        = useState(resolveInitialEmail(initialEmail));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError,   setLocalError]   = useState<string | null>(null);
  const [showSuccess,  setShowSuccess]  = useState(false);
  const { secondsRemaining, start: startCooldown } = useResendCooldown();

  async function handleSend() {
    if (isSubmitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setLocalError(copy.auth.emptyFieldsError);
      return;
    }

    setLocalError(null);
    setIsSubmitting(true);

    try {
      const { error } = await sendPasswordResetEmail(normalizedEmail);
      if (error) {
        // A real request error (rate-limited, network, malformed input) —
        // distinct from "email not registered", which resetPasswordForEmail
        // never reveals in the first place, so surfacing this specific
        // error is not an enumeration regression.
        setLocalError(isRateLimitError(error) ? copy.auth.resetLinkRateLimited : copy.auth.resetLinkRequestError);
        return;
      }
      setShowSuccess(true);
      startCooldown();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (secondsRemaining > 0) return;
    const normalizedEmail = email.trim().toLowerCase();
    setLocalError(null);
    const { error } = await sendPasswordResetEmail(normalizedEmail);
    if (error) {
      setLocalError(isRateLimitError(error) ? copy.auth.resetLinkRateLimited : copy.auth.resetLinkRequestError);
      return;
    }
    startCooldown();
  }

  if (showSuccess) {
    return (
      <FormScreen title={copy.auth.resetLinkSentTitle} subtitle={copy.auth.resetLinkSentBody} hero={<Text style={heroEmoji}>📬</Text>}>
        {localError ? <Banner tone="danger" text={localError} /> : null}
        <AppButton
          label={secondsRemaining > 0
            ? copy.auth.resendEmailCountdown.replace('{n}', String(secondsRemaining))
            : copy.auth.resendEmailButton}
          variant="secondary"
          onPress={() => { void handleResend(); }}
          disabled={secondsRemaining > 0}
        />
        <AppButton label={copy.auth.backToSignIn} variant="ghost" compact onPress={onBack} />
      </FormScreen>
    );
  }

  return (
    <FormScreen title={copy.auth.forgotPasswordTitle} subtitle={copy.auth.forgotPasswordSubtitle}>
      <TextField
        label={copy.auth.emailLabel}
        value={email}
        onChangeText={setEmail}
        placeholder={copy.auth.emailPlaceholder}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        editable={!isSubmitting}
      />

      {localError ? <Banner tone="danger" text={localError} /> : null}

      <AppButton
        label={copy.auth.forgotPasswordButton}
        onPress={() => { void handleSend(); }}
        busy={isSubmitting}
        busyLabel={copy.auth.sendingResetLink}
      />
      <AppButton label={copy.auth.backToSignIn} variant="ghost" compact onPress={onBack} disabled={isSubmitting} />
    </FormScreen>
  );
}

const heroEmoji = { fontSize: 48 } as const;
