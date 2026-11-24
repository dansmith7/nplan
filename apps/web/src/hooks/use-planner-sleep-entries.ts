import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

export type SleepReport = { energy: number; sleepiness: number; clarity: number; mood: number };
export type PlannerSleepEntry = {
  id: string;
  date: string;
  bedtime: string;
  wakeTime: string;
  awakenings: number | null;
  awakeMinutes?: number | null;
  dayReport?: SleepReport;
};

type SleepRow = {
  id: string;
  day: string;
  bedtime: string;
  wake_time: string;
  awakenings: number | null;
  awake_minutes?: number | null;
  day_report: SleepReport | null;
};

const keyFor = (id?: string) => ["planner", "sleep-entries", id] as const;

// Preview and production share the database. Keep the new field on this
// browser until the production column is released.
const browserOnlyAwakeMinutes = import.meta.env.VITE_NPLAN_SLEEP_PREVIEW === "true";
const awakeMinutesKey = (userId: string, id: string) => `nplan:preview:awake-minutes:${userId}:${id}`;
const sleepColumns = "id, day, bedtime, wake_time, awakenings, day_report";
const sleepColumnsWithAwakeMinutes = `${sleepColumns}, awake_minutes` as const;

export function usePlannerSleepEntries() {
  const { isConfigured, session } = useSupabaseSession();
  const client = useQueryClient();
  const userId = session?.user.id;
  const key = keyFor(userId);
  const query = useQuery({
    queryKey: key,
    enabled: isConfigured && Boolean(userId),
    queryFn: async () => {
      const db = requireSupabase();
      const entries: PlannerSleepEntry[] = [];
      const pageSize = 500;
      let before: string | undefined;
      for (;;) {
        let page = db.from("sleep_entries").select(browserOnlyAwakeMinutes ? sleepColumns : sleepColumnsWithAwakeMinutes)
          .eq("user_id", userId!).order("day", { ascending: false }).limit(pageSize);
        if (before) page = page.lt("day", before);
        const { data, error } = await page.overrideTypes<SleepRow[], { merge: false }>();
        if (error) throw error;
        for (const row of data) {
          const savedMinutes = browserOnlyAwakeMinutes
            ? localStorage.getItem(awakeMinutesKey(userId!, row.id))
            : row.awake_minutes;
          entries.push({
            id: row.id, date: row.day, bedtime: row.bedtime.slice(0, 5), wakeTime: row.wake_time.slice(0, 5),
            awakenings: row.awakenings, awakeMinutes: savedMinutes == null ? null : Number(savedMinutes), dayReport: row.day_report ?? undefined,
          });
        }
        if (data.length < pageSize) return entries;
        before = data.at(-1)!.day;
      }
    },
  });
  const invalidate = () => client.invalidateQueries({ queryKey: key });
  const save = useMutation({
    mutationFn: async ({ entry, edit = false, importReport = false }: { entry: PlannerSleepEntry; edit?: boolean; importReport?: boolean }) => {
      const table = requireSupabase().from("sleep_entries");
      if (!userId) throw new Error("Authentication required");
      const fields = {
        day: entry.date, bedtime: entry.bedtime, wake_time: entry.wakeTime, awakenings: entry.awakenings,
        ...(browserOnlyAwakeMinutes ? {} : { awake_minutes: entry.awakeMinutes ?? null }),
      };
      const insertFields = { ...fields, day_report: importReport ? entry.dayReport ?? null : null };
      const { data, error } = edit
        ? await table.update(fields).eq("id", entry.id).select("id").single()
        : await table.insert(insertFields).select("id").single();
      if (error) throw error;
      if (browserOnlyAwakeMinutes) {
        const key = awakeMinutesKey(userId, data.id);
        if (entry.awakeMinutes == null) localStorage.removeItem(key);
        else localStorage.setItem(key, String(entry.awakeMinutes));
      }
    },
    onSuccess: invalidate,
  });
  const saveDay = useMutation({
    mutationFn: async ({ id, report }: { id: string; report: SleepReport }) => {
      const { error } = await requireSupabase().from("sleep_entries").update({ day_report: report }).eq("id", id).select("id").single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().from("sleep_entries").delete().eq("id", id);
      if (error) throw error;
      if (browserOnlyAwakeMinutes && userId) localStorage.removeItem(awakeMinutesKey(userId, id));
    },
    onSuccess: invalidate,
  });
  return { ...query, save, saveDay, remove };
}
