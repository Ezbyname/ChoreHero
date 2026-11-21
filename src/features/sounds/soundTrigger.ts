// Pure "play this sound once" gate for playful feedback sounds. No React,
// no native audio — the player is injected (soundPlayer.ts).
//
// Rules:
//   - callers invoke play() ONLY after the corresponding server action
//     succeeded (never on a failed request);
//   - each (event, key) plays at most once — key is the submission id, so a
//     re-render, a retried success callback, or a duplicate Realtime event
//     can never replay it;
//   - a player failure is swallowed: a sound must never break the flow.

export type AppSoundEvent = 'completion_submitted' | 'completion_withdrawn';

export type SoundPlayer = {
  play: (event: AppSoundEvent) => void | Promise<void>;
};

export type SoundTrigger = {
  // true when the sound was started now; false when it was a duplicate.
  play: (event: AppSoundEvent, key: string) => boolean;
};

export function createSoundTrigger(player: SoundPlayer, maxRemembered = 100): SoundTrigger {
  const played = new Set<string>();
  return {
    play(event, key) {
      const id = `${event}:${key}`;
      if (played.has(id)) return false;
      played.add(id);
      if (played.size > maxRemembered) {
        const oldest = played.values().next().value;
        if (oldest !== undefined) played.delete(oldest);
      }
      try {
        const r = player.play(event);
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
      } catch {
        // ignore — sound is decoration only
      }
      return true;
    },
  };
}
