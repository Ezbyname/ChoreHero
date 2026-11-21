// One design system, two intensities (Board 14).
//   child — larger, softer, tactile
//   adult — denser, flatter, quieter
// Shared primitives accept an optional `density`. Omitting it keeps the
// legacy rendering exactly, so no existing screen changes until a call
// site opts in.
export type Density = 'child' | 'adult';

export const DENSITIES: readonly Density[] = ['child', 'adult'];
