export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
} as const;

// Locked design-system spacing scale (Board 14): 4 / 8 / 12 / 16 / 24.
// A strict subset of `spacing` with the SAME key names — facelift screens
// consume this; the legacy 20 (xl) and 32 (xxxl) steps stay in `spacing`
// for the existing screens that still use them.
export const lockedSpacing = {
  xs:  spacing.xs,
  sm:  spacing.sm,
  md:  spacing.md,
  lg:  spacing.lg,
  xxl: spacing.xxl,
} as const;
