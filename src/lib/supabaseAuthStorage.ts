// Web/default — no `storage` key at all, so Supabase's own browser storage
// default applies unchanged. This bare file is what Web bundling AND the
// plain Node unit-test runner both resolve to (see aliasLoader.mjs, which
// has no knowledge of Metro's platform-suffix convention and can only ever
// find this file). Native builds get supabaseAuthStorage.native.ts instead,
// via Metro's platform-extension resolution.
//
// Deliberately an empty object, not `{ storage: undefined }` — some option-
// merging logic can behave differently for an explicitly-`undefined` value
// than for an absent key. Spreading `{}` guarantees the key is genuinely
// absent on Web, matching Supabase's own React Native quickstart pattern.
export const supabaseAuthStorageOptions = {};
