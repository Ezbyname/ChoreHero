import { requireOptionalNativeModule, type NativeModule } from 'expo';
import { Keyboard, Platform } from 'react-native';
import { keyboardTopFromSignal, type KeyboardSignal } from '@/features/adultRewards/keyboardOverlap';

// Where Create Reward learns the keyboard's top edge (screen space, dp;
// null = no keyboard).
//
// Android (vc23): the local KeyboardFrame module (modules/keyboard-frame)
// reports EVERY keyboard geometry change, including a switch between the
// text keyboard and the number pad without the keyboard closing — React
// Native's keyboardDidShow/keyboardDidHide only fire when visibility flips,
// so they left stale padding (vc22 FAIL).
// Elsewhere (iOS / web), or if the module is missing: React Native's events.
type KeyboardFrameEvents = {
  onKeyboardFrame(event: { visible: boolean; screenY: number; height: number }): void;
};
declare class KeyboardFrameModule extends NativeModule<KeyboardFrameEvents> {}

const KeyboardFrame = Platform.OS === 'android'
  ? requireOptionalNativeModule<KeyboardFrameModule>('KeyboardFrame')
  : null;

export function subscribeKeyboardTop(onTop: (keyboardTop: number | null) => void): () => void {
  const emit = (signal: KeyboardSignal) => onTop(keyboardTopFromSignal(signal));
  if (KeyboardFrame) {
    const sub = KeyboardFrame.addListener('onKeyboardFrame', (e) =>
      emit({ kind: 'frame', visible: e.visible, screenY: e.screenY }));
    return () => sub.remove();
  }
  const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
  const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
  const show = Keyboard.addListener(showEvent, (e) => emit({ kind: 'show', screenY: e.endCoordinates.screenY }));
  const hide = Keyboard.addListener(hideEvent, () => emit({ kind: 'hide' }));
  return () => { show.remove(); hide.remove(); };
}
