// Pure state for the adult Create Task form (AssignedByMeScreen). No React —
// Node-test safe.
//
//   - Create is disabled while a creation is in flight, and the in-flight
//     guard (createSingleFlight) drops a second tap that lands before the
//     disabled state re-renders, so one tap = one task;
//   - success is shown only after createTask() resolved ok, as a clear
//     banner naming the task; the form resets for the next one;
//   - a failure keeps everything the adult typed, with a visible error.

import type { CreateTaskResult } from '@/features/tasks/createTask';

export type CreateTaskPhase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'created'; title: string }
  | { kind: 'failed' };

export const INITIAL_CREATE_PHASE: CreateTaskPhase = { kind: 'idle' };

export function canSubmitCreateTask(phase: CreateTaskPhase): boolean {
  return phase.kind !== 'submitting';
}

export function onCreateTaskStarted(): CreateTaskPhase {
  return { kind: 'submitting' };
}

export function onCreateTaskResult(result: CreateTaskResult, title: string): CreateTaskPhase {
  return result.ok ? { kind: 'created', title: title.trim() } : { kind: 'failed' };
}

export function onCreateTaskThrew(): CreateTaskPhase {
  return { kind: 'failed' };
}

// Typing again after a result clears the old banner.
export function onCreateTaskEdited(phase: CreateTaskPhase): CreateTaskPhase {
  return phase.kind === 'created' || phase.kind === 'failed' ? INITIAL_CREATE_PHASE : phase;
}

// Whether the form fields should be cleared for the next task.
export function shouldResetCreateForm(phase: CreateTaskPhase): boolean {
  return phase.kind === 'created';
}

// Generic "only one at a time" gate for a tap handler: a second call while
// the first is still running is ignored (returns undefined), not queued.
export function createSingleFlight() {
  let running = false;
  return async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (running) return undefined;
    running = true;
    try {
      return await fn();
    } finally {
      running = false;
    }
  };
}
