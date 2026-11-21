// Pure sizing rules for the child Task Completion sheet. No react-native
// imports — Node-test safe. TaskCompletionModal.tsx feeds it
// useWindowDimensions() values.
//
// Why this exists: on Android with edge-to-edge (forced on in Expo SDK 56)
// a Modal's dialog window draws under the navigation bar, and the photo
// preview used to be a full-width square. Together they pushed the Submit
// button under the system bar. The sheet now (a) caps its own height, (b)
// scrolls the body while keeping the Submit/Cancel footer outside the
// scroll area, and (c) sizes the preview from the window, not just its
// width. Bottom safe-area padding is applied natively by SafeAreaView.

// Fraction of the window the sheet may occupy; the rest stays visible as
// the dimmed backdrop so the sheet never reaches under the status bar.
export const SHEET_MAX_HEIGHT_RATIO = 0.9;

// Preview never takes more than this fraction of the window height, so the
// footer always has room even on short screens or with large font scale.
export const PREVIEW_MAX_HEIGHT_RATIO = 0.32;

export const PREVIEW_MIN_HEIGHT = 120;

export type CompletionSheetLayout = {
  sheetMaxHeight: number;
  previewHeight:  number;
};

export function computeCompletionSheetLayout(input: {
  windowWidth:       number;
  windowHeight:      number;
  horizontalPadding: number;
}): CompletionSheetLayout {
  const contentWidth  = Math.max(0, input.windowWidth - input.horizontalPadding * 2);
  const previewCap    = input.windowHeight * PREVIEW_MAX_HEIGHT_RATIO;
  const previewHeight = Math.round(Math.max(PREVIEW_MIN_HEIGHT, Math.min(contentWidth, previewCap)));
  return {
    sheetMaxHeight: Math.round(input.windowHeight * SHEET_MAX_HEIGHT_RATIO),
    previewHeight,
  };
}
