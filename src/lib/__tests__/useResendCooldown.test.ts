import assert from 'node:assert/strict';
import test from 'node:test';
import { createCooldownController, COOLDOWN_SECONDS } from '@/lib/useResendCooldown';

// Models a real repeating setInterval: a registered timer fires once per
// `period` and reschedules itself, so a single large tick() that spans
// multiple periods fires it multiple times (not just once) — matching what
// the real (unmocked) setInterval the production code runs against does.
function fakeClock() {
  let now = 0;
  const timers: Array<{ at: number; period: number; fn: () => void } | undefined> = [];
  return {
    setInterval: (fn: () => void, ms: number) => {
      timers.push({ at: now + ms, period: ms, fn });
      return timers.length - 1;
    },
    clearInterval: (id: number) => {
      timers[id] = undefined;
    },
    tick(ms: number) {
      now += ms;
      for (let i = 0; i < timers.length; i++) {
        let t = timers[i];
        while (t && t.at <= now) {
          t.fn();
          t = timers[i];
          if (t) t.at += t.period;
        }
      }
    },
  };
}

test('starts at 0 (not on cooldown) before any send', () => {
  const clock = fakeClock();
  const controller = createCooldownController(clock);
  assert.equal(controller.getSecondsRemaining(), 0);
});

test('starting cooldown sets remaining to COOLDOWN_SECONDS', () => {
  const clock = fakeClock();
  const controller = createCooldownController(clock);
  controller.start();
  assert.equal(controller.getSecondsRemaining(), COOLDOWN_SECONDS);
});

test('ticks down by 1 per second and reaches 0 after COOLDOWN_SECONDS', () => {
  const clock = fakeClock();
  const controller = createCooldownController(clock);
  controller.start();
  for (let i = 0; i < COOLDOWN_SECONDS; i++) {
    clock.tick(1000);
  }
  assert.equal(controller.getSecondsRemaining(), 0);
});

test('starting again mid-countdown resets to the full duration', () => {
  const clock = fakeClock();
  const controller = createCooldownController(clock);
  controller.start();
  clock.tick(10_000);
  assert.equal(controller.getSecondsRemaining(), COOLDOWN_SECONDS - 10);
  controller.start();
  assert.equal(controller.getSecondsRemaining(), COOLDOWN_SECONDS);
});

test('stop() clears the interval and resets remaining to 0', () => {
  const clock = fakeClock();
  const controller = createCooldownController(clock);
  controller.start();
  clock.tick(5000);
  controller.stop();
  assert.equal(controller.getSecondsRemaining(), 0);
});
