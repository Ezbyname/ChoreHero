// Show Password (Sign In). The visibility flag is pure presentation: it only
// drives the password TextInput's secureTextEntry and the checkbox's own
// checked state. It never reads, writes, or derives anything from the
// password value, the form error, or the sign-in action — extracted here so
// that boundary is directly unit-tested (this repo has no render-test
// infrastructure; the screen wiring itself is verified by TypeScript and
// device QA).

export const INITIAL_SHOW_PASSWORD = false;

export function togglePasswordVisibility(showPassword: boolean): boolean {
  return !showPassword;
}

export function isPasswordMasked(showPassword: boolean): boolean {
  return !showPassword;
}

export function showPasswordAccessibilityState(showPassword: boolean): { checked: boolean } {
  return { checked: showPassword };
}
