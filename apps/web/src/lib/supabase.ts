import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Browser client. The anon key is intentionally public; data access is
 * controlled by the RLS policies in the Supabase migration.
 */
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

const getSessionStorageKey = () => {
  if (!supabaseUrl) return null;
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
};

/**
 * The app route runs before React mounts. Read the persisted session here so
 * its legacy route guard does not send a signed-in Supabase user back to login.
 */
export function getStoredSupabaseSession(): Session | null {
  if (typeof window === "undefined") return null;
  const storageKey = getSessionStorageKey();
  if (!storageKey) return null;

  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Session | null;
    if (!value?.access_token || !value?.refresh_token) return null;
    if (value.expires_at && value.expires_at * 1000 <= Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to apps/web/.env.local."
    );
  }

  return supabase;
}
