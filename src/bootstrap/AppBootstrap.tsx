import React, { useEffect } from 'react';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/useAppStore';

export function AppBootstrap() {
  const isMockHydrated    = useAppStore((s) => s.isMockHydrated);
  const hydrateFromMockSeed = useAppStore((s) => s.hydrateFromMockSeed);

  useEffect(() => {
    if (!isMockHydrated) {
      hydrateFromMockSeed();
    }
  }, []);

  return <RootNavigator />;
}
