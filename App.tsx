import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { AppBootstrap } from '@/bootstrap/AppBootstrap';
import { startFontLoading } from '@/features/startup/fontLoader';
import { StartupSplash } from '@/features/startup/StartupSplash';
import { bindEvidenceCacheToSession } from '@/features/tasks/evidenceSession';

// Cached evidence photos are deleted on sign-out / user switch.
bindEvidenceCacheToSession();

// Rubik loads in parallel with auth + first hydration. The existing
// StartupSplash waits for it to settle (loaded, or system-font fallback
// after a failure / timeout). No second splash.
startFontLoading();

export default function App() {
  // initialMetrics: without it SafeAreaProvider renders no children until the
  // native insets arrive, so React's first frame was an empty root over the
  // window background (the vc21 white hand-off between the native launch
  // screen and StartupSplash). With it, the green splash is in frame one.
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="auto" />
      <AppBootstrap />
      {/* Cold-start only; drawn above the app while auth + first load run. */}
      <StartupSplash />
    </SafeAreaProvider>
  );
}
