import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { copy } from '@/content/copy';
import {
  SPLASH_MAX_VISIBLE_MS,
  isStartupReady,
  pickSplashIndex,
  shouldDismissSplash,
  splashCoverFrame,
} from '@/features/startup/startupSplashRules';
import { useFontsSettled } from '@/features/startup/fontLoader';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { selectIsAuthenticated } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors } from '@/theme';

// Bundled with the app: portrait 941x1672 WebP converted from the owner's
// splash set (01_clean_home_happy_heart, 03_kitchen_hero_shining,
// 04_cleaning_hero_chorehero, 05_cleaning_hero_kitchen,
// 09_sparkling_world_of_chores, 10_house_champion_hero,
// 11_cleaning_champion_hero, 14_hero_with_shiny_logo — in that order).
// Each already shows the ChoreHero logo. Never read from any path outside
// the app.
const SPLASH_IMAGES = [
  require('../../../assets/splash/splash-1.webp'),
  require('../../../assets/splash/splash-2.webp'),
  require('../../../assets/splash/splash-3.webp'),
  require('../../../assets/splash/splash-4.webp'),
  require('../../../assets/splash/splash-5.webp'),
  require('../../../assets/splash/splash-6.webp'),
  require('../../../assets/splash/splash-7.webp'),
  require('../../../assets/splash/splash-8.webp'),
];

// Chosen once per app process: navigation, re-renders and remounts keep
// the same picture; only a new cold start picks again.
const chosenIndex = pickSplashIndex(Math.random, SPLASH_IMAGES.length);
let dismissedThisProcess = false;

// Full-screen overlay drawn ABOVE the app while it starts (auth + first
// data load run underneath), so the plain "Getting ChoreHero ready…"
// screens are never what a user sees at startup. Fades out once startup is
// ready and at least SPLASH_MIN_VISIBLE_MS have passed.
export function StartupSplash() {
  const [visible, setVisible] = useState(!dismissedThisProcess);
  const opacity    = useRef(new Animated.Value(1)).current;
  const startedAt  = useRef(Date.now()).current;
  const insets     = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const isAuthResolved    = useAppStore((s) => s.isAuthResolved);
  const isAuthLoading     = useAppStore((s) => s.isAuthLoading);
  const isAuthenticated   = useAppStore(selectIsAuthenticated);
  const appHydrationState = useAppStore((s) => s.appHydrationState);
  const fontsSettled      = useFontsSettled();
  const ready = isStartupReady({ supabaseConfigured: isSupabaseConfigured, isAuthResolved, isAuthLoading, isAuthenticated, appHydrationState, fontsSettled });

  useEffect(() => {
    if (!visible) return;
    const check = () => {
      if (!shouldDismissSplash({ elapsedMs: Date.now() - startedAt, ready })) return false;
      dismissedThisProcess = true;
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => setVisible(false));
      return true;
    };
    if (check()) return;
    const timer = setInterval(() => { if (check()) clearInterval(timer); }, 250);
    const cap   = setTimeout(() => { check(); }, SPLASH_MAX_VISIBLE_MS + 50);
    return () => { clearInterval(timer); clearTimeout(cap); };
  }, [visible, ready, startedAt, opacity]);

  if (!visible) return null;

  // Full-bleed artwork pinned under the status bar (cover; see
  // splashCoverFrame). The aspect is the known art size, so no asset
  // metadata lookup is needed (that API is missing on react-native-web).
  const frame = splashCoverFrame({ width, height, insetTop: insets.top });

  return (
    <Animated.View
      style={[styles.overlay, { opacity }]}
      accessible
      accessibilityLabel={copy.startup.splashA11y}
      accessibilityLiveRegion="polite">
      {/* Light icons over the dark-green strip while the splash is mounted;
          the app's root StatusBar style returns when it unmounts. */}
      <StatusBar style="light" />
      <Image
        source={SPLASH_IMAGES[chosenIndex]}
        style={{ position: 'absolute', left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
        resizeMode="cover"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    bottom:          0,
    backgroundColor: colors.splash,
    zIndex:          1000,
    elevation:       1000,
    overflow:        'hidden',
  },
});
