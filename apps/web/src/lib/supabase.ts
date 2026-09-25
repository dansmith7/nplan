import { createClient } from "@supabase/supabase-js";

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
          // The planner is single-user. In some embedded Chromium contexts
          // navigator.locks can leave Auth.js waiting forever during a
          // concurrent initial getSession() and sign-in. A local client lock
          // is enough here and keeps the password form responsive.
          lock: async (_name, _acquireTimeout, fn) => fn(),
        },
      })
    : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to apps/web/.env.local."
    );
  }

  return supabase;
}
