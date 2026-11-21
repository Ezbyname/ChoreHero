// Slice 5A: child-intensity text styles from the locked Board 14 type
// scale. Pure: no React and no react-native.
//
// Board 14 gives the child intensity heavier weights than the base scale
// (Display 800, H1 800, H2 700, Body/title 600, Caption 500, Overline 700)
// at the same sizes and line heights.
//   - Rubik ready: the matching Rubik family carries the weight, and
//     fontWeight stays 'normal' (Android picks the weight from the family).
//   - Not ready (loading, failed or timed out): the same size, line height
//     and weight on the system font. The layout doesn't change, only the
//     typeface.

import { rubikFamilyForWeight, typeScale, type TypeScaleToken } from '@/theme';

export type ChildTypeToken = 'display' | 'h1' | 'h2' | 'title' | 'caption' | 'overline';

export const CHILD_WEIGHTS: Record<ChildTypeToken, '500' | '600' | '700' | '800'> = {
  display:  '800',
  h1:       '800',
  h2:       '700',
  title:    '600',
  caption:  '500',
  overline: '700',
};

const BASE: Record<ChildTypeToken, TypeScaleToken> = {
  display:  'displayChild',
  h1:       'h1',
  h2:       'h2',
  title:    'title',
  caption:  'caption',
  overline: 'overline',
};

export type ChildTextStyle = {
  fontSize:       number;
  lineHeight:     number;
  fontWeight:     'normal' | '500' | '600' | '700' | '800';
  fontFamily?:    string;
  letterSpacing?: number;
  textTransform?: 'uppercase';
};

export function childText(token: ChildTypeToken, rubikReady: boolean): ChildTextStyle {
  const base = typeScale[BASE[token]] as { fontSize: number; lineHeight: number; letterSpacing?: number; textTransform?: 'uppercase' };
  const weight = CHILD_WEIGHTS[token];
  const shared = {
    fontSize:   base.fontSize,
    lineHeight: base.lineHeight,
    ...(base.letterSpacing !== undefined ? { letterSpacing: base.letterSpacing } : null),
    ...(base.textTransform ? { textTransform: base.textTransform } : null),
  };
  return rubikReady
    ? { ...shared, fontFamily: rubikFamilyForWeight(weight), fontWeight: 'normal' }
    : { ...shared, fontWeight: weight };
}
