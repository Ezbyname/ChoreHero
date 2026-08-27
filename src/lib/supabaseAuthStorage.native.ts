import AsyncStorage from '@react-native-async-storage/async-storage';

// Native-only — Metro resolves this in place of supabaseAuthStorage.ts on
// iOS/Android builds. The plain Node unit-test runner (scripts/test/
// aliasLoader.mjs) has no knowledge of the `.native.ts` suffix convention
// and can never resolve to this file, so this AsyncStorage import is never
// touched by `npm run test:unit`.
export const supabaseAuthStorageOptions = {
  storage: AsyncStorage,
};
