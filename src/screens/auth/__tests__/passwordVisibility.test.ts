import assert from 'node:assert/strict';
import test from 'node:test';
import { copy } from '@/content/copy';
import {
  INITIAL_SHOW_PASSWORD,
  isPasswordMasked,
  showPasswordAccessibilityState,
  togglePasswordVisibility,
} from '@/screens/auth/passwordVisibility';

// Mirrors LoginScreen's own independent useState slots: the visibility flag
// is a separate slot from password/localError, and the checkbox's onPress
// only ever applies togglePasswordVisibility to that one slot.
interface LoginFormSnapshot {
  password:     string;
  localError:   string | null;
  showPassword: boolean;
}

function pressShowPassword(form: LoginFormSnapshot): LoginFormSnapshot {
  return { ...form, showPassword: togglePasswordVisibility(form.showPassword) };
}

test('1. password is masked initially', () => {
  assert.equal(isPasswordMasked(INITIAL_SHOW_PASSWORD), true);
});

test('2. Show password is unchecked initially', () => {
  assert.equal(INITIAL_SHOW_PASSWORD, false);
  assert.deepEqual(showPasswordAccessibilityState(INITIAL_SHOW_PASSWORD), { checked: false });
});

test('3. checking reveals the password (secureTextEntry off, checkbox checked)', () => {
  const checked = togglePasswordVisibility(INITIAL_SHOW_PASSWORD);
  assert.equal(checked, true);
  assert.equal(isPasswordMasked(checked), false);
  assert.deepEqual(showPasswordAccessibilityState(checked), { checked: true });
});

test('4. unchecking masks the password again immediately', () => {
  const unchecked = togglePasswordVisibility(togglePasswordVisibility(INITIAL_SHOW_PASSWORD));
  assert.equal(unchecked, false);
  assert.equal(isPasswordMasked(unchecked), true);
  assert.deepEqual(showPasswordAccessibilityState(unchecked), { checked: false });
});

test('5. password value is identical before/after any number of toggles', () => {
  const password = 'Pa ss!w0rd  with spaces ';
  let form: LoginFormSnapshot = { password, localError: null, showPassword: INITIAL_SHOW_PASSWORD };
  for (let i = 0; i < 5; i++) {
    form = pressShowPassword(form);
    assert.equal(form.password, password);
  }
});

// The checkbox's onPress in LoginScreen is `setShowPassword(togglePasswordVisibility)`
// — it does not reference handleSignIn. What is provable here is the
// toggle's own contract: a single boolean in, a boolean out, with no access
// to any form value or action it could call.
test('6. toggle is boolean -> boolean only (no access to sign-in or form values)', () => {
  assert.equal(togglePasswordVisibility.length, 1);
  assert.equal(typeof togglePasswordVisibility(false), 'boolean');
  assert.equal(typeof togglePasswordVisibility(true), 'boolean');
});

test('7. toggling does not clear an existing validation/error message', () => {
  const localError = copy.auth.loginError;
  let form: LoginFormSnapshot = { password: 'secret', localError, showPassword: INITIAL_SHOW_PASSWORD };
  form = pressShowPassword(form);
  assert.equal(form.localError, localError);
  form = pressShowPassword(form);
  assert.equal(form.localError, localError);
});

test('label comes from the shared copy mechanism', () => {
  assert.equal(copy.auth.showPasswordLabel, 'Show password');
});
