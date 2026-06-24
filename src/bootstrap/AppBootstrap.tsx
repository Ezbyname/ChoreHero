import React, { useEffect } from 'react';
import { AuthBootstrap } from '@/bootstrap/AuthBootstrap';
import { AuthGate } from '@/navigation/AuthGate';
import { useAppStore } from '@/store/useAppStore';

export function AppBootstrap() {
  const isMockHydrated      = useAppStore((s) => s.isMockHydrated);
  const hydrateFromMockSeed = useAppStore((s) => s.hydrateFromMockSeed);

  useEffect(() => {
    if (!isMockHydrated) {
      hydrateFromMockSeed();
    }
  }, []);

  return (
    <AuthBootstrap>
      <AuthGate />
    </AuthBootstrap>
  );
}
