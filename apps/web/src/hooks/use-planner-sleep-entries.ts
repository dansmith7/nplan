import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

export type SleepReport = { energy: number; sleepiness: number; clarity: number; mood: number };
export type PlannerSleepEntry = { id: string; date: string; bedtime: string; wakeTime: string; awakenings: number; dayReport?: SleepReport };
const keyFor = (id?: string) => ["planner", "sleep-entries", id] as const;
export function usePlannerSleepEntries() {
  const { isConfigured, session } = useSupabaseSession(), client = useQueryClient(), key = keyFor(session?.user.id);
  const query = useQuery({ queryKey: key, enabled: isConfigured && Boolean(session?.user.id), queryFn: async () => { const { data, error } = await requireSupabase().from("sleep_entries").select("id, day, bedtime, wake_time, awakenings, day_report").order("day", { ascending: false }); if (error) throw error; return data.map((v) => ({ id: v.id, date: v.day, bedtime: v.bedtime.slice(0, 5), wakeTime: v.wake_time.slice(0, 5), awakenings: v.awakenings, dayReport: v.day_report as SleepReport | undefined })); } });
  const invalidate = () => client.invalidateQueries({ queryKey: key });
  const save = useMutation({ mutationFn: async (entry: PlannerSleepEntry) => { const { error } = await requireSupabase().from("sleep_entries").upsert({ day: entry.date, bedtime: entry.bedtime, wake_time: entry.wakeTime, awakenings: entry.awakenings, day_report: entry.dayReport ?? null }, { onConflict: "user_id,day" }); if (error) throw error; }, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: async (id: string) => { const { error } = await requireSupabase().from("sleep_entries").delete().eq("id", id); if (error) throw error; }, onSuccess: invalidate });
  return { ...query, save, remove };
}
