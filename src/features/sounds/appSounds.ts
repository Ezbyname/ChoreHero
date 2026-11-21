import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';
import { uiAudioModeFor } from '@/features/sounds/audioMode';
import { createSoundTrigger, type AppSoundEvent, type SoundPlayer } from '@/features/sounds/soundTrigger';

// Original, bundled sound files (synthesized for ChoreHero — no third-party
// audio). Short (< 0.7 s) and quiet by design.
export const SOUND_ASSETS: Record<AppSoundEvent, number> = {
  completion_submitted: require('../../../assets/sounds/completion-submitted.wav'),
  completion_withdrawn: require('../../../assets/sounds/completion-withdrawn.wav'),
};

const SOUND_VOLUME = 0.6;

// Device audio behaviour, set once before the first sound — platform rules
// (Android: media volume decides, plays on vibrate/silent; iOS: the silent
// switch wins) live in audioMode.ts.
const AUDIO_MODE = uiAudioModeFor(Platform.OS);

// Players are created lazily on the first confirmed success, so nothing
// native is loaded at app start, and reused afterwards.
const players: Partial<Record<AppSoundEvent, AudioPlayer>> = {};
let audioModeRequested = false;

const expoAudioPlayer: SoundPlayer = {
  async play(event) {
    if (!audioModeRequested) {
      audioModeRequested = true;
      await setAudioModeAsync(AUDIO_MODE).catch(() => undefined);
    }
    let player = players[event];
    if (!player) {
      player = createAudioPlayer(SOUND_ASSETS[event]);
      player.volume = SOUND_VOLUME;
      players[event] = player;
    }
    await player.seekTo(0);
    player.play();
  },
};

// The ONLY entry point screens use. createSoundTrigger enforces: once per
// (event, submission id), and a player failure never breaks the flow.
// Callers invoke it only after the server confirmed the action.
export const appSounds = createSoundTrigger(expoAudioPlayer);
