import { useCallback, useEffect, useRef, useState } from 'react';

export const COOLDOWN_SECONDS = 30;

interface ClockLike {
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
}

const realClock: ClockLike = {
  setInterval: (fn, ms) => setInterval(fn, ms) as unknown as number,
  clearInterval: (id) => clearInterval(id),
};

// Plain, timer-injectable state machine — no React — so it's unit-testable
// under node:test without a component renderer. useResendCooldown below is
// the only thing that touches React state.
export function createCooldownController(clock: ClockLike = realClock) {
  let remaining = 0;
  let intervalId: number | null = null;

  function clearExistingInterval() {
    if (intervalId !== null) {
      clock.clearInterval(intervalId);
      intervalId = null;
    }
  }

  function start() {
    clearExistingInterval();
    remaining = COOLDOWN_SECONDS;
    intervalId = clock.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = 0;
        clearExistingInterval();
      }
    }, 1000);
  }

  function stop() {
    clearExistingInterval();
    remaining = 0;
  }

  return {
    start,
    stop,
    getSecondsRemaining: () => remaining,
  };
}

// React wrapper. secondsRemaining is 0 when the resend button should be
// enabled; > 0 shows a countdown and disables it. Unmounting the component
// clears the interval — remounting starts fresh at 0, per this feature's
// spec (the cooldown is client-side UX state only, not persisted).
export function useResendCooldown() {
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const controllerRef = useRef(createCooldownController());

  useEffect(() => {
    const controller = controllerRef.current;
    return () => controller.stop();
  }, []);

  const start = useCallback(() => {
    const controller = controllerRef.current;
    controller.start();
    setSecondsRemaining(controller.getSecondsRemaining());
    const poll = setInterval(() => {
      const remaining = controller.getSecondsRemaining();
      setSecondsRemaining(remaining);
      if (remaining <= 0) clearInterval(poll);
    }, 250);
  }, []);

  return { secondsRemaining, start };
}
