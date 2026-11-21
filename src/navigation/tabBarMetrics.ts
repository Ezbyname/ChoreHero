// Bottom tab bar height under a larger system font. Pure and Node-test safe.
//
// @react-navigation/bottom-tabs gives the bar a FIXED 49dp (+ bottom inset)
// whatever the font scale. The 12sp tab label grows with the Android font
// size setting, so at 130% it no longer fits and its bottom is clipped
// (seen on Android in the vc13 QA gate). The bar grows by the label's growth
// instead. At font scale 1.0 nothing changes: no explicit height is set.

// bottom-tabs' own bar height (UIKit layout) before the bottom inset.
export const TAB_BAR_BASE_HEIGHT = 49;
// Height of the 12sp tab label line at font scale 1.0.
export const TAB_LABEL_LINE_HEIGHT = 16;
// Breathing room once the label has grown, so descenders (y, g) are not cut.
const GROWTH_MARGIN = 2;

export function tabBarExtraHeight(fontScale: number): number {
  if (!Number.isFinite(fontScale) || fontScale <= 1) return 0;
  return Math.ceil(TAB_LABEL_LINE_HEIGHT * (fontScale - 1)) + GROWTH_MARGIN;
}

// The explicit bar height to set, or null to keep the library default.
// bottom-tabs uses an explicit height as-is and still pads the bottom inset
// inside it, so the inset is part of the height.
export function tabBarHeightFor(fontScale: number, bottomInset: number): number | null {
  const extra = tabBarExtraHeight(fontScale);
  return extra === 0 ? null : TAB_BAR_BASE_HEIGHT + extra + Math.max(0, bottomInset);
}
