// Bare/Web variant. supabase.ts needs `detectSessionInUrl: true` on Web
// (real browser URL, real Location object) and `false` on native — kept as
// its own platform-file pair (see supabaseAuthPlatform.native.ts) rather
// than a runtime `typeof window` check, because React Native 0.85 aliases
// `global.window = global` (see authRedirectCapture.ts's comment for the
// full explanation and the confirmed native-boot crash this pattern fixes),
// so that check reads as "web" on native too.
export const detectSessionInUrl = true;
