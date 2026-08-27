// Native-only platform bootstrap. React Native's built-in URL
// implementation is not fully spec-compliant; Supabase's own React Native
// quickstart requires this polyfill to be loaded before the Supabase
// client is constructed. Kept as its own platform-bootstrap module rather
// than folded into supabaseAuthStorage.native.ts — this is a runtime
// environment concern, not a storage concern.
//
// Metro resolves this file in place of supabaseNativeSetup.ts on iOS/
// Android; the plain Node unit-test runner can never resolve to it (same
// `.native.ts` exclusion as supabaseAuthStorage.native.ts).
import 'react-native-url-polyfill/auto';

export {};
