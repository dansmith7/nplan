import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

export type LessonStatus = "scheduled" | "held" | "cancelled";
export type PlannerLessonRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  recurrence: "none" | "weekly" | "monthly";
  student: { id: string; name: string };
  notes: {
    topic: string | null;
    homework: string | null;
    status: LessonStatus;
    completed_at: string | null;
    cancelled_at: string | null;
  } | null;
};

type LessonRange = { from: string; to: string };
const lessonKey = (userId?: string, range?: LessonRange) =>
  ["planner", "lessons", userId, range?.from, range?.to] as const;

async function getLessons(range: LessonRange): Promise<PlannerLessonRow[]> {
  const { data, error } = await requireSupabase()
    .from("calendar_events")
    .select(
      "id, title, starts_at, ends_at, recurrence, student:students!inner(id, name), notes:lesson_notes(topic, homework, status, completed_at, cancelled_at)"
    )
    .eq("kind", "lesson")
    .gte("starts_at", range.from)
    .lt("starts_at", range.to)
    .order("starts_at")
    .returns<PlannerLessonRow[]>();
  if (error) throw error;
  return data;
}

export function usePlannerLessons(range: LessonRange) {
  const queryClient = useQueryClient();
  const { isConfigured, session } = useSupabaseSession();
  const key = lessonKey(session?.user.id, range);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getLessons(range),
    enabled: isConfigured && Boolean(session?.user.id),
    staleTime: 30_000,
  });
  const invalidate = React.useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["planner", "lessons", session?.user.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["planner", "calendar-events", session?.user.id],
        }),
      ]),
    [queryClient, session?.user.id]
  );

  const saveNotes = useMutation({
    mutationFn: async ({
      eventId,
      topic,
      homework,
    }: {
      eventId: string;
      topic: string;
      homework: string;
    }) => {
      const { error } = await requireSupabase()
        .from("lesson_notes")
        .update({ topic: topic || null, homework: homework || null })
        .eq("event_id", eventId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: async ({
      eventId,
      status,
    }: {
      eventId: string;
      status: LessonStatus;
    }) => {
      const now = new Date().toISOString();
      const { error } = await requireSupabase()
        .from("lesson_notes")
        .update({
          status,
          completed_at: status === "held" ? now : null,
          cancelled_at: status === "cancelled" ? now : null,
        })
        .eq("event_id", eventId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await requireSupabase()
        .from("calendar_events")
        .delete()
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...query, saveNotes, setStatus, remove };
}
