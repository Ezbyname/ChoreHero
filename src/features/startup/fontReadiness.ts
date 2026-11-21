// Font readiness state machine. Pure, with an injected loader and timer, so
// it is node-test safe. The expo-font wiring lives in fontLoader.ts.
//
//   idle → loading → ready      (Rubik registered)
//                  → failed     (load rejected OR timed out → system font)
//
// 'ready' and 'failed' are both terminal and both count as "settled" for
// the startup splash. A failed or slow font load can never hold startup
// past FONT_LOAD_TIMEOUT_MS. SPLASH_MAX_VISIBLE_MS also still applies on
// top of that.

export type FontStatus = 'idle' | 'loading' | 'ready' | 'failed';

// Local bundled assets normally register in well under a second. The cap
// sits inside the splash's 4.5 s minimum on a normal start, so it never
// lengthens the splash on its own.
export const FONT_LOAD_TIMEOUT_MS = 4000;

export function isFontStatusSettled(status: FontStatus): boolean {
  return status === 'ready' || status === 'failed';
}

export interface FontReadinessDeps {
  load:         () => Promise<void>;
  setTimer:     (fn: () => void, ms: number) => unknown;
  clearTimer:   (handle: unknown) => void;
  onDiagnostic?: (message: string, error?: unknown) => void;
  timeoutMs?:   number;
}

export interface FontReadiness {
  getStatus: () => FontStatus;
  subscribe: (listener: () => void) => () => void;
  // Idempotent: only the first call starts a load.
  start:     () => void;
}

export function createFontReadiness(deps: FontReadinessDeps): FontReadiness {
  let status: FontStatus = 'idle';
  const listeners = new Set<() => void>();

  const settle = (next: 'ready' | 'failed') => {
    if (isFontStatusSettled(status)) return; // first terminal outcome wins
    status = next;
    for (const l of [...listeners]) l();
  };

  return {
    getStatus: () => status,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start: () => {
      if (status !== 'idle') return;
      status = 'loading';
      for (const l of [...listeners]) l();

      const timeoutMs = deps.timeoutMs ?? FONT_LOAD_TIMEOUT_MS;
      const timer = deps.setTimer(() => {
        if (status === 'loading') deps.onDiagnostic?.(`Rubik font load timed out after ${timeoutMs} ms; using system font`);
        settle('failed');
      }, timeoutMs);

      let pending: Promise<void>;
      try {
        pending = deps.load();
      } catch (error) {
        pending = Promise.reject(error);
      }
      pending.then(
        () => { deps.clearTimer(timer); settle('ready'); },
        (error) => {
          deps.clearTimer(timer);
          deps.onDiagnostic?.('Rubik font load failed; using system font', error);
          settle('failed');
        },
      );
    },
  };
}
