import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { getStoredSupabaseSession, supabase } from "@/lib/supabase";

type SupabaseSessionState = {
  isConfigured: boolean;
  isLoading: boolean;
  session: Session | null;
};

/**
 * Keeps the Supabase browser session in React state. The subscription is the
 * single source of truth after the initial session lookup, so a magic-link
 * return immediately unlocks the planner without a page refresh.
 */
export function useSupabaseSession(): SupabaseSessionState {
  const [session, setSession] = React.useState<Session | null>(getStoredSupabaseSession);
  const [isLoading, setIsLoading] = React.useState(
    () => Boolean(supabase) && !Boolean(getStoredSupabaseSession())
  );

  React.useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? getStoredSupabaseSession());
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    isConfigured: Boolean(supabase),
    isLoading,
    session,
  };
}
