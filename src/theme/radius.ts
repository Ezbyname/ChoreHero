export const radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  pill: 999,

  // Locked design-system radii (Board 14): 10 / 12 / 14 / 20 / 28.
  // Semantic and opt-in — existing call sites keep sm/md/lg/xl.
  chip:      10,
  field:     12,
  control:   14, // buttons + adult cards
  childCard: 20,
  sheet:     28,
} as const;
