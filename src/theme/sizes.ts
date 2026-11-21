// Shared size tokens. Tap targets follow the Android / Material 48dp
// minimum; icon-only buttons are never smaller than 44dp.
export const sizes = {
  tapTarget:     48,
  iconButton:    44,
  thumbnail:     64,
  avatar:        40,
  sheetMaxRatio: 0.92,

  // Locked design system (Board 14) — opt-in density sizes.
  childButton:   56,
  adultButton:   48,
  lockedField:   52,
} as const;
