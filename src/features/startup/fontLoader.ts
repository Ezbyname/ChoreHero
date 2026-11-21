// Rubik registration (Expo SDK 56, expo-font ~56.0.7). Wires the pure
// fontReadiness state machine to expo-font's loadAsync and the bundled
// assets. Uses a runtime load, which works in development builds and on
// web, rather than the build-time config plugin, so a failure can always
// fall back to the system font instead of bricking startup.
//
// Each key is its own family (SDK 56 has no multi-weight family; see
// src/theme/fonts.ts). Key names equal each file's PostScript name.

import { loadAsync } from 'expo-font';
import { useSyncExternalStore } from 'react';
import { createFontReadiness, isFontStatusSettled, type FontStatus } from '@/features/startup/fontReadiness';
import { RUBIK, type RubikFamily } from '@/theme/fonts';

export const RUBIK_FONT_SOURCES: Record<RubikFamily, number> = {
  [RUBIK.regular]:   require('../../../assets/fonts/Rubik-Regular.ttf'),
  [RUBIK.medium]:    require('../../../assets/fonts/Rubik-Medium.ttf'),
  [RUBIK.semiBold]:  require('../../../assets/fonts/Rubik-SemiBold.ttf'),
  [RUBIK.bold]:      require('../../../assets/fonts/Rubik-Bold.ttf'),
  [RUBIK.extraBold]: require('../../../assets/fonts/Rubik-ExtraBold.ttf'),
};

const readiness = createFontReadiness({
  load:       () => loadAsync(RUBIK_FONT_SOURCES),
  setTimer:   (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  // Recoverable: the app keeps running on the system font.
  onDiagnostic: (message, error) => { console.warn(`[fonts] ${message}`, error ?? ''); },
});

// Called once at app module scope (App.tsx). Idempotent.
export function startFontLoading(): void {
  readiness.start();
}

export function getFontStatus(): FontStatus {
  return readiness.getStatus();
}

export function useFontStatus(): FontStatus {
  return useSyncExternalStore(readiness.subscribe, readiness.getStatus, readiness.getStatus);
}

// For the startup splash gate.
export function useFontsSettled(): boolean {
  return isFontStatusSettled(useFontStatus());
}

// For facelift screens: pass to lockedTextStyle(token, ready). False means
// render on the system font (still loading, failed or timed out).
export function useRubikReady(): boolean {
  return useFontStatus() === 'ready';
}
