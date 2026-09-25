import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

export type StudentScheduleRow = {
  id: string;
  weekday: number;
  starts_at: string;
  duration_minutes: number;
  timezone: string;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
};

export type PlannerStudentRow = {
  id: string;
  name: string;
  schedule_note: string | null;
  schedules: StudentScheduleRow[];
};

const studentsKey = (userId?: string) => ["planner", "students", userId] as const;

async function getStudents(): Promise<PlannerStudentRow[]> {
  const { data, error } = await requireSupabase()
    .from("students")
    .select(
      "id, name, schedule_note, schedules:student_schedules(id, weekday, starts_at, duration_minutes, timezone, starts_on, ends_on, active)"
    )
    .order("name")
    .returns<PlannerStudentRow[]>();
  if (error) throw error;
  return data;
}

export function usePlannerStudents() {
  const queryClient = useQueryClient();
  const { isConfigured, session } = useSupabaseSession();
  const key = studentsKey(session?.user.id);
  const query = useQuery({
    queryKey: key,
    queryFn: getStudents,
    enabled: isConfigured && Boolean(session?.user.id),
    staleTime: 30_000,
  });
  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: key }),
    [key, queryClient]
  );

  const create = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await requireSupabase().from("students").insert({ name: name.trim() });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await requireSupabase()
        .from("students")
        .update({ name: name.trim() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...query, create, rename, remove };
}

