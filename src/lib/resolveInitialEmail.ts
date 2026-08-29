// A1 — Recovery Email Prefill. Pure — kept in its own .ts file (not inside
// ForgotPasswordScreen.tsx) specifically so it's loadable by the plain Node
// test runner: Node's --experimental-strip-types loader rejects .tsx
// outright regardless of whether a given export uses JSX, so a pure helper
// living inside a .tsx screen file is untestable there. Matches this
// repo's existing convention (e.g. appBootstrapView.ts living outside
// AppBootstrap.tsx) rather than inventing a new one.
export function resolveInitialEmail(initialEmail?: string): string {
  return initialEmail ?? '';
}
