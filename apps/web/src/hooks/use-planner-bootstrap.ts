import { useQuery } from "@tanstack/react-query";
import { getPlannerBootstrap } from "@/lib/planner-data";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

/** Initial, session-scoped read for the personal planner. */
export function usePlannerBootstrap() {
  const { isConfigured, session } = useSupabaseSession();

  return useQuery({
    queryKey: ["planner", "bootstrap", session?.user.id],
    queryFn: getPlannerBootstrap,
    enabled: isConfigured && Boolean(session?.user.id),
    staleTime: 5 * 60 * 1000,
  });
}
