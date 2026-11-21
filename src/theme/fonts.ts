// Rubik font families for the locked design system (Board 14). Pure — no
// expo-font, no asset require()s — so it is node-test safe. The binaries
// are registered in src/features/startup/fontLoader.ts.
//
// One family per weight, on purpose: on Android a custom font never lets
// `fontWeight` pick a different binary reliably (SDK 56 has no multi-weight
// family registration; that arrives in SDK 58), so every weight is its own
// explicit family and the style carries fontWeight 'normal'.
//
// Opt-in only. Nothing in the existing `typography` object changes, and no
// existing screen uses these families until the facelift migrates it.

import type { TextStyle } from 'react-native';
import { typeScale } from './typography';

export const RUBIK = {
  regular:   'Rubik-Regular',   // 400
  medium:    'Rubik-Medium',    // 500
  semiBold:  'Rubik-SemiBold',  // 600
  bold:      'Rubik-Bold',      // 700
  extraBold: 'Rubik-ExtraBold', // 800
} as const;

export type RubikFamily = (typeof RUBIK)[keyof typeof RUBIK];
export type RubikWeight = 400 | 500 | 600 | 700 | 800;

export const RUBIK_BY_WEIGHT: Record<RubikWeight, RubikFamily> = {
  400: RUBIK.regular,
  500: RUBIK.medium,
  600: RUBIK.semiBold,
  700: RUBIK.bold,
  800: RUBIK.extraBold,
};

// Deterministic: 'normal'/undefined → 400, 'bold' → 700, numeric strings
// snap to the nearest registered weight (ties round up), clamped 400..800.
export function rubikFamilyForWeight(weight: TextStyle['fontWeight']): RubikFamily {
  let n: number;
  if (weight === undefined || weight === 'normal') n = 400;
  else if (weight === 'bold') n = 700;
  else n = Number(weight);
  if (!Number.isFinite(n)) n = 400;
  const clamped = Math.min(800, Math.max(400, n));
  const snapped = (Math.round(clamped / 100) * 100) as RubikWeight;
  return RUBIK_BY_WEIGHT[snapped];
}

export type TypeScaleToken = keyof typeof typeScale;

// The typography layer facelift screens opt into. When Rubik is ready the
// token renders in the matching Rubik family. Otherwise it is the plain
// typeScale style on the system font, with its weight kept so the
// hierarchy still reads. That fallback is deterministic and never throws.
export function lockedTextStyle(token: TypeScaleToken, fontsReady: boolean): TextStyle {
  const base: TextStyle = { ...typeScale[token] };
  if (!fontsReady) return base;
  return { ...base, fontFamily: rubikFamilyForWeight(base.fontWeight), fontWeight: 'normal' };
}
