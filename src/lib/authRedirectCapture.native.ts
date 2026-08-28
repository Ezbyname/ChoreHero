// Native variant (Metro-only — see authRedirectCapture.ts for why this is
// a platform-file split rather than a runtime `window` check). There is no
// browser location to read on native, and no incoming auth-redirect link
// lands here the way it does on Web, so this always resolves to no markers
// — classifyAuthRedirect('', '') deterministically returns { type: 'none' }.
export const capturedHash = '';
export const capturedSearch = '';
