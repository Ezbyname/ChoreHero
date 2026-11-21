// App-wide colour system. Every text/background pair used for readable text
// meets WCAG AA (4.5:1) on `surface` / `background`:
//   textPrimary  #111827  ~17:1      textSecondary #4B5563  ~7.6:1
//   textMuted    #6B7280  ~4.8:1     primary       #4F46E5  ~6.3:1
//   success      #15803D  ~5.0:1     warning       #B45309  ~5.0:1
//   danger       #B91C1C  ~6.5:1     info          #1D4ED8  ~6.7:1
// Each *Soft tint is a background for its matching strong colour's text.
export const colors = {
  background:     '#F6F6FA',
  surface:        '#FFFFFF',
  surfaceMuted:   '#F1F2F7',
  textPrimary:    '#111827',
  textSecondary:  '#4B5563',
  textMuted:      '#6B7280',
  textOnColor:    '#FFFFFF',
  border:         '#E3E5EC',
  borderSoft:     '#EDEEF3',
  primary:        '#4F46E5',
  primaryPressed: '#4338CA',
  primarySoft:    '#EEF0FF',
  success:        '#15803D',
  successSoft:    '#DCFCE7',
  warning:        '#B45309',
  warningSoft:    '#FEF3C7',
  warningBorder:  '#F5D58A',
  danger:         '#B91C1C',
  dangerSoft:     '#FEE2E2',
  errorSoft:      '#FEE2E2',
  info:           '#1D4ED8',
  infoSoft:       '#DBEAFE',
  overlay:        'rgba(17, 24, 39, 0.55)',
  // Dark translucent chip / button over a photo.
  scrim:          'rgba(0, 0, 0, 0.55)',
  // Startup splash backdrop: the dark green of the art's top edge, shown in
  // the status-bar strip above the full-bleed artwork.
  splash:         '#26520A',
  // Full-screen photo viewer.
  viewer:         '#000000',

  // ── Locked design system (Board 14) — additive, opt-in only ─────────────
  // Values that coincide with a legacy token above are kept equal on
  // purpose (asserted in designTokens.test.ts):
  //   indigo = primary, indigoTint = primarySoft, error = danger,
  //   errorSoft (above) = error background, waitingSoft = warningSoft.
  indigo:         '#4F46E5',
  indigoDeep:     '#3730A3',
  indigoTint:     '#EEF0FF',
  // Child-card depth edge: indigo at ~14%.
  indigoDepth:    'rgba(79, 70, 229, 0.14)',
  // Gold is ONLY for Points and prizes / rewards. Ink on gold ≈ 10:1.
  gold:           '#FFB627',
  goldDeep:       '#D4900F',
  onGold:         '#0F172A',
  waiting:        '#92520A',
  waitingSoft:    '#FEF3C7',
  error:          '#B91C1C',
  ink:            '#0F172A',
  adultGround:    '#F7F8FC',

  // Child-only surfaces (Board 02 / Board 14). The boards draw gradients:
  //   - header #5B4BF0 → #7C3AED
  //   - hero   #6D5BF0 → #B04AD6
  // The app has no gradient renderer, and adding one would be a new
  // dependency, so each surface uses its gradient's start colour. White
  // text stays at least 4.5:1 on both.
  childHeader:    '#5B4BF0',
  childHero:      '#6D5BF0',
  // Progress tracks: on the child header, and on white child cards.
  onChildTrack:   'rgba(255, 255, 255, 0.35)',
  childTrack:     'rgba(15, 23, 42, 0.08)',
} as const;
