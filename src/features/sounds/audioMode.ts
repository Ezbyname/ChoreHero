// Device audio behaviour for ChoreHero's short UI sounds. Pure — no
// expo-audio import, Node-test safe (appSounds.ts passes the result to
// setAudioModeAsync).
//
//   playsInSilentMode
//     Android: true. expo-audio's Android player silently skips play()
//       unless this is true or the ringer is NORMAL — so with false, a
//       phone on vibrate / silent never heard either sound (Phase 1 RCA,
//       AudioModule.kt shouldPlayInSilentMode). On Android these are media
//       sounds, like a game's: the Media volume decides, not the ringer.
//     iOS: false — the hardware silent switch keeps winning there.
//   mixWithOthers   — never stops or ducks the user's own music;
//   no background playback, no recording (the expo-audio config plugin is
//   deliberately NOT used: it would add RECORD_AUDIO and a foreground media
//   service, which two short UI sounds do not need).
export type UiAudioMode = {
  playsInSilentMode:      boolean;
  interruptionMode:       'mixWithOthers';
  shouldPlayInBackground: false;
  allowsRecording:        false;
};

export function uiAudioModeFor(platformOS: string): UiAudioMode {
  return {
    playsInSilentMode:      platformOS === 'android',
    interruptionMode:       'mixWithOthers',
    shouldPlayInBackground: false,
    allowsRecording:        false,
  };
}
