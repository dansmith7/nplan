import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

export type PlannerDailyCard = {
  id: string;
  day: string;
  workout_type: string | null;
  workout_minutes: number | null;
  activity_note: string | null;
  had_sex: boolean | null;
  alcohol_units: number | null;
  cigarettes: number | null;
  ate_junk_food: boolean | null;
  weight_kg: number | null;
  note: string | null;
};

export type DailyCardInput = Omit<PlannerDailyCard, "id">;

const keyFor = (userId?: string, day?: string) => ["planner", "daily-card", userId, day] as const;

async function getDailyCard(day: string): Promise<PlannerDailyCard | null> {
  const { data, error } = await requireSupabase()
    .from("daily_cards")
    .select("id, day, workout_type, workout_minutes, activity_note, had_sex, alcohol_units, cigarettes, ate_junk_food, weight_kg, note")
    .eq("day", day)
    .maybeSingle<PlannerDailyCard>();
  if (error) throw error;
  return data;
}

export function usePlannerDailyCard(day: string) {
  const queryClient = useQueryClient();
  const { isConfigured, session } = useSupabaseSession();
  const key = keyFor(session?.user.id, day);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getDailyCard(day),
    enabled: isConfigured && Boolean(session?.user.id) && Boolean(day),
    staleTime: 30_000,
  });
  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: key }),
    [key, queryClient]
  );
  const save = useMutation({
    mutationFn: async (input: DailyCardInput) => {
      const { data, error } = await requireSupabase()
        .from("daily_cards")
        .upsert(input, { onConflict: "user_id,day" })
        .select("id, day, workout_type, workout_minutes, activity_note, had_sex, alcohol_units, cigarettes, ate_junk_food, weight_kg, note")
        .single<PlannerDailyCard>();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  return { ...query, save };
}
