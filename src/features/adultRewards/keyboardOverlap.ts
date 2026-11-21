// Create Reward keyboard overlap (Android gate vc20 → vc21). Pure and
// Node-test safe.
//
// Both inputs MUST be in the same coordinate space:
//   - keyboardTop: Keyboard event `endCoordinates.screenY`. On Android
//     (RN 0.85, ReactRootView.checkForKeyboardEvents) this is the bottom of
//     getWindowVisibleDisplayFrame, i.e. SCREEN coordinates (origin = top of
//     the display, above the status bar).
//   - frameTop: View.measure()'s pageY — the frame's position relative to
//     the React root view (Fabric DOM measure: includeViewportOffset=false).
//     With Expo SDK 56's mandatory edge-to-edge the root view starts at the
//     top of the display, so pageY is screen-space too.
// measureInWindow() is NOT usable here: Fabric adds a viewport offset of
// -(visible frame top) = -status bar height, so its origin sits BELOW the
// status bar. That mismatch left vc20 short by exactly the status-bar
// height (needed 692 px, applied 630 px; status bar 63 px).
export function keyboardOverlap(input: { frameTop: number; frameHeight: number; keyboardTop: number }): number {
  const { frameTop, frameHeight, keyboardTop } = input;
  if (![frameTop, frameHeight, keyboardTop].every(Number.isFinite)) return 0;
  return Math.max(0, Math.round(frameTop + frameHeight - keyboardTop));
}

// vc23: one signal shape for every keyboard source (see keyboardTopSource.ts).
//   frame — Android KeyboardFrame module: every geometry change, including a
//           text keyboard <-> number pad switch with the keyboard staying up.
//   show / hide — React Native's keyboardDid/WillShow / Hide (visibility
//           flips only; used where the module is unavailable).
export type KeyboardSignal =
  | { kind: 'frame'; visible: boolean; screenY: number }
  | { kind: 'show'; screenY: number }
  | { kind: 'hide' };

// The keyboard's top edge after a signal (screen space, dp), or null when
// no keyboard is up. Stateless: each signal carries the whole geometry, so
// repeated switches can never accumulate padding.
export function keyboardTopFromSignal(signal: KeyboardSignal): number | null {
  if (signal.kind === 'hide') return null;
  if (signal.kind === 'frame' && !signal.visible) return null;
  return Number.isFinite(signal.screenY) ? signal.screenY : null;
}

// The bottom padding Create Reward needs for a keyboard top (null = none).
export function overlapForKeyboardTop(frame: { frameTop: number; frameHeight: number }, keyboardTop: number | null): number {
  return keyboardTop === null ? 0 : keyboardOverlap({ ...frame, keyboardTop });
}
