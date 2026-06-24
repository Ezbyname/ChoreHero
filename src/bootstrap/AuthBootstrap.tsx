import React, { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { useAppStore } from '@/store/useAppStore';

interface AuthBootstrapProps {
  children: React.ReactNode;
}

/**
 * Singleton auth event bridge.
 * The ONLY component allowed to translate Supabase auth events into store state.
 * Supabase = source of truth. Zustand = UI projection. This = the bridge.
 *
 * When Supabase is not configured, marks auth as resolved immediately so the
 * rest of the app can render without blocking on a listener that will never fire.
 */
export function AuthBootstrap({ children }: AuthBootstrapProps) {
  const applyAuthSession = useAppStore((s) => s.applyAuthSession);
  const clearAuthSession = useAppStore((s) => s.clearAuthSession);
  const setAuthLoading   = useAppStore((s) => s.setAuthLoading);
  const setAuthError     = useAppStore((s) => s.setAuthError);
  const markAuthResolved = useAppStore((s) => s.markAuthResolved);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // No Supabase credentials — resolve immediately so AuthGate never blocks.
      markAuthResolved();
      return;
    }

    setAuthLoading(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        switch (event) {
          case 'INITIAL_SESSION':
          case 'SIGNED_IN':
            applyAuthSession(session);
            break;

          case 'SIGNED_OUT':
            clearAuthSession();
            break;

          case 'TOKEN_REFRESHED':
          case 'USER_UPDATED':
          case 'PASSWORD_RECOVERY':
            applyAuthSession(session);
            break;
        }
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}
