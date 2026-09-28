import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import type { PlannerDailyCard } from "@/hooks/use-planner-daily-card";

export function usePlannerDailyCards(from: string) {
  const { isConfigured, session } = useSupabaseSession();
  return useQuery({
    queryKey: ["planner", "daily-cards", session?.user.id, from],
    enabled: isConfigured && Boolean(session?.user.id),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("daily_cards")
        .select("id, day, workout_type, workout_minutes, activity_note, had_sex, alcohol_units, cigarettes, ate_junk_food, weight_kg, note")
        .gte("day", from).order("day", { ascending: true }).returns<PlannerDailyCard[]>();
      if (error) throw error;
      return data;
    },
  });
}
