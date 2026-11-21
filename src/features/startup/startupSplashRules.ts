// Pure rules for the startup splash — Node-test safe.
//
// Shown ONLY at cold app start: one random image for ~4.5 s, then the app,
// and never again in this process (not on navigation, not on re-hydration,
// never as an upload / submission progress screen).

export const SPLASH_IMAGE_COUNT   = 8;
export const SPLASH_MIN_VISIBLE_MS = 4500;
// Safety valve: if startup never reports ready (e.g. a hung request), the
// splash still lifts so the underlying screen (with its own error / retry
// UI) becomes reachable.
export const SPLASH_MAX_VISIBLE_MS = 20000;

export function pickSplashIndex(random: () => number = Math.random, count: number = SPLASH_IMAGE_COUNT): number {
  const r = random();
  const i = Math.floor((Number.isFinite(r) ? r : 0) * count);
  return Math.min(count - 1, Math.max(0, i));
}

export type StartupSignals = {
  supabaseConfigured: boolean;
  isAuthResolved:     boolean;
  isAuthLoading:      boolean;
  isAuthenticated:    boolean;
  appHydrationState:  'idle' | 'loading' | 'hydrated' | 'partial' | 'error';
  // Rubik reached a terminal state: loaded, or failed / timed out and
  // falling back to the system font (see fontReadiness.ts). Omitted counts
  // as settled, so callers that predate fonts keep their behaviour.
  fontsSettled?:      boolean;
};

// "The first real screen can be shown": fonts settled, auth known, and for
// a signed-in user the first hydration reached a terminal state (data, no
// household, or an error screen with its own message).
export function isStartupReady(s: StartupSignals): boolean {
  if (s.fontsSettled === false) return false;
  if (!s.supabaseConfigured) return true;
  if (!s.isAuthResolved || s.isAuthLoading) return false;
  if (!s.isAuthenticated) return true;
  return s.appHydrationState === 'hydrated' || s.appHydrationState === 'partial' || s.appHydrationState === 'error';
}

export function shouldDismissSplash(input: { elapsedMs: number; ready: boolean }): boolean {
  if (input.elapsedMs >= SPLASH_MAX_VISIBLE_MS) return true;
  return input.ready && input.elapsedMs >= SPLASH_MIN_VISIBLE_MS;
}

// Layout: the art is full-bleed portrait (941x1672, ~9:16) with the
// ChoreHero logo painted at its top, so there is no separate text title.
// It COVERS the screen below the status bar:
//  - the top edge is pinned just under the status bar, so the logo is never
//    cropped or hidden behind the status-bar icons;
//  - on phones taller than 9:16 the sides are trimmed evenly (centred);
//  - on wider screens (tablets) only the bottom (floor) is trimmed.
// The status-bar strip above the art is the dark-green splash backdrop.
export const SPLASH_ART_WIDTH  = 941;
export const SPLASH_ART_HEIGHT = 1672;
export const SPLASH_ART_ASPECT = SPLASH_ART_WIDTH / SPLASH_ART_HEIGHT;

export function splashCoverFrame(input: {
  width:    number;
  height:   number;
  insetTop: number;
  aspect?:  number; // image width / height
}): { width: number; height: number; left: number; top: number } {
  const aspect = input.aspect !== undefined && Number.isFinite(input.aspect) && input.aspect > 0
    ? input.aspect : SPLASH_ART_ASPECT;
  const top  = Math.max(0, input.insetTop);
  const boxW = Math.max(0, input.width);
  const boxH = Math.max(0, input.height - top);
  const w = Math.ceil(Math.max(boxW, boxH * aspect));
  const h = Math.ceil(w / aspect);
  return { width: w, height: h, left: Math.floor((boxW - w) / 2), top };
}
