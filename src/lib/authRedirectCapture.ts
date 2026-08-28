// Bare/Web variant. Captures the raw location hash/search strings that
// authRedirectDetection.ts classifies. Kept in its own platform-file pair
// (see authRedirectCapture.native.ts) rather than a runtime `typeof window`
// check: React Native 0.85 aliases `global.window = global` on native (see
// node_modules/react-native/Libraries/Core/setUpGlobals.js), so `typeof
// window !== 'undefined'` is true there too — but `window.location` is
// never defined on native, so reading `.hash`/`.search` after that check
// would throw at module-evaluation time. Metro/the bundler resolve this
// file only for Web; native gets the trivial empty-string variant instead,
// so this module's `window` access never executes there at all.
const isWeb = typeof window !== 'undefined';

export const capturedHash = isWeb ? window.location.hash : '';
export const capturedSearch = isWeb ? window.location.search : '';
