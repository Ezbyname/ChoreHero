// Helpful claim form layout under a larger system font. Pure and Node-test safe.
//
// The form is one row: the "What did you do?" input plus the "Send for
// approval" button. At 130% font on a 360dp phone (vc13 Android QA gate) the
// row no longer has room: the placeholder was cut to "What did you" and the
// button label wrapped. When the row's width in font-scaled units is too
// small, the form stacks (input on top, full-width button below) instead of
// clipping. Font scaling is never disabled; the copy is unchanged.

// The narrowest row, in dp divided by the font scale, that still fits the
// full placeholder beside the button. 360dp at 100% stays a row.
export const CLAIM_ROW_MIN_SCALED_WIDTH = 340;

export function claimFormStacked(windowWidth: number, fontScale: number): boolean {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) return false;
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  return windowWidth / scale < CLAIM_ROW_MIN_SCALED_WIDTH;
}
