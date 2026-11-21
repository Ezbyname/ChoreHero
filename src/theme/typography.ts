import type { TextStyle } from 'react-native';

export const typography: Record<string, TextStyle> = {
  title: {
    fontSize:   28,
    fontWeight: '700',
    lineHeight: 34,
  },
  // Sheet / modal titles and card-group headings.
  heading: {
    fontSize:   20,
    fontWeight: '700',
    lineHeight: 26,
  },
  subtitle: {
    fontSize:   15,
    fontWeight: '400',
    lineHeight: 22,
  },
  // Section headers inside a screen ("Waiting for your review").
  section: {
    fontSize:   17,
    fontWeight: '700',
    lineHeight: 24,
  },
  body: {
    fontSize:   16,
    fontWeight: '400',
    lineHeight: 24,
  },
  bodyStrong: {
    fontSize:   16,
    fontWeight: '600',
    lineHeight: 24,
  },
  caption: {
    fontSize:   13,
    fontWeight: '400',
    lineHeight: 18,
  },
  // Small uppercase-free labels (pills, form labels).
  label: {
    fontSize:   13,
    fontWeight: '600',
    lineHeight: 18,
  },
  button: {
    fontSize:   15,
    fontWeight: '600',
    lineHeight: 20,
  },
};

// Locked semantic type scale (Board 14) — size / line-height in dp.
// Opt-in only: nothing in `typography` above changes. Stays on the system
// font until Slice 3 (Rubik); no fontFamily is set here on purpose.
export const typeScale = {
  display:      { fontSize: 26, lineHeight: 29, fontWeight: '700' },
  displayChild: { fontSize: 26, lineHeight: 29, fontWeight: '800' },
  h1:           { fontSize: 22, lineHeight: 26, fontWeight: '700' },
  h2:           { fontSize: 17, lineHeight: 21, fontWeight: '700' },
  body:         { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  title:        { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption:      { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  overline:     { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;
