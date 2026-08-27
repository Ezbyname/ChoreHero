// Web/default — no-op. Native platform bootstrap (currently: the URL
// polyfill Supabase's client needs on React Native) lives in
// supabaseNativeSetup.native.ts instead, Metro-resolved on iOS/Android.
// This bare file is what Web bundling and the plain Node unit-test runner
// both resolve to. Imported for its side effect only, before the Supabase
// client is constructed — see supabase.ts.
export {};
