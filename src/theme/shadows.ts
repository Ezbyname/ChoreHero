import type { ViewStyle } from 'react-native';
import { colors } from './colors';

export const shadows: Record<string, ViewStyle> = {
  card: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius:  4,
    elevation:     2,
  },
  soft: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius:  8,
    elevation:     3,
  },
  // Locked floating sheet — intent "0 -12 40 black 20%". RN shadowRadius is
  // roughly half a CSS blur; Android only honours elevation (no upward
  // offset), so 24 is the closest platform-safe equivalent.
  sheet: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: -12 },
    shadowOpacity: 0.2,
    shadowRadius:  20,
    elevation:     24,
  },
  // Explicitly no shadow (adult cards, child cards that use a depth edge).
  none: {
    shadowOpacity: 0,
    elevation:     0,
  },
};

// Locked "tactile" depth (Board 14). A zero-blur "0 4 0" shadow cannot be
// rendered reliably by Android elevation, so the intent is expressed as a
// solid 4dp bottom edge, which renders identically on iOS, Android and web.
export const DEPTH_EDGE = 4;

export const depth = {
  childCard:   { borderBottomWidth: DEPTH_EDGE, borderBottomColor: colors.indigoDepth },
  childButton: { borderBottomWidth: DEPTH_EDGE, borderBottomColor: colors.indigoDeep },
  goldButton:  { borderBottomWidth: DEPTH_EDGE, borderBottomColor: colors.goldDeep },
} as const satisfies Record<string, ViewStyle>;
