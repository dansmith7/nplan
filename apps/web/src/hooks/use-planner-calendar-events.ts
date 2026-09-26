import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

export type CalendarEventKind = "task" | "lesson" | "meeting";
export type PlannerCalendarEventRow = {
  id: string;
  task_id: string | null;
  student_id: string | null;
  kind: CalendarEventKind;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  recurrence: "none" | "weekly" | "monthly";
  student: { id: string; name: string } | null;
  notes: {
    topic: string | null;
    homework: string | null;
    status: "scheduled" | "held" | "cancelled";
  } | null;
  collection_item_id: string | null;
};

export type CalendarEventInput = {
  kind: CalendarEventKind;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  studentId?: string | null;
  taskId?: string | null;
  recurrence?: "none" | "weekly" | "monthly";
};

type EventRange = { from: string; to: string };
const calendarKey = (userId?: string, range?: EventRange) =>
  ["planner", "calendar-events", userId, range?.from, range?.to] as const;

async function getCalendarEvents(
  range: EventRange
): Promise<PlannerCalendarEventRow[]> {
  const client = requireSupabase();
  const [calendarResult, birthdayResult] = await Promise.all([
    client
      .from("calendar_events")
      .select("id, task_id, student_id, kind, title, description, starts_at, ends_at, recurrence, student:students(id, name), notes:lesson_notes(topic, homework, status)")
      .gte("starts_at", range.from).lt("starts_at", range.to).order("starts_at")
      .returns<Array<Omit<PlannerCalendarEventRow, "collection_item_id">>>(),
    client
      .from("test_collection_calendar_events")
      .select("id, item_id, title, starts_at, ends_at")
      .gte("starts_at", range.from).lt("starts_at", range.to).order("starts_at"),
  ]);
  if (calendarResult.error) throw calendarResult.error;
  if (birthdayResult.error) throw birthdayResult.error;
  const calendar = calendarResult.data
    .filter((event) => event.notes?.status !== "cancelled")
    .map((event) => ({ ...event, collection_item_id: null }));
  const birthdays: PlannerCalendarEventRow[] = (birthdayResult.data ?? []).map((event) => ({
    id: `collection:${event.id}`,
    task_id: null,
    student_id: null,
    kind: "meeting",
    title: event.title,
    description: "Ежегодное напоминание из коллекции «Дни рождения»",
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    recurrence: "none",
    student: null,
    notes: null,
    collection_item_id: event.item_id,
  }));
  return [...calendar, ...birthdays].sort((a,b) => a.starts_at.localeCompare(b.starts_at));
}

const toRow = (input: CalendarEventInput) => ({
  kind: input.kind,
  title: input.title.trim(),
  description: input.description ?? null,
  starts_at: input.startsAt,
  ends_at: input.endsAt,
  student_id: input.studentId ?? null,
  task_id: input.taskId ?? null,
  recurrence: input.recurrence ?? "none",
});

export function usePlannerCalendarEvents(range: EventRange) {
  const queryClient = useQueryClient();
  const { isConfigured, session } = useSupabaseSession();
  const key = calendarKey(session?.user.id, range);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getCalendarEvents(range),
    enabled: isConfigured && Boolean(session?.user.id),
    staleTime: 30_000,
  });
  const invalidate = React.useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["planner", "calendar-events", session?.user.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["planner", "lessons", session?.user.id],
        }),
      ]),
    [queryClient, session?.user.id]
  );
  const create = useMutation({
    mutationFn: async (input: CalendarEventInput) => {
      const { error } = await requireSupabase()
        .from("calendar_events")
        .insert(toRow(input));
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({
      id,
      ...input
    }: CalendarEventInput & { id: string }) => {
      const birthdayId = id.startsWith("collection:") ? id.slice(11) : null;
      const { error } = birthdayId
        ? await requireSupabase().from("test_collection_calendar_events").update({ title: input.title.trim(), starts_at: input.startsAt, ends_at: input.endsAt }).eq("id", birthdayId)
        : await requireSupabase().from("calendar_events").update(toRow(input)).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...input }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlannerCalendarEventRow[]>(key);
      queryClient.setQueryData<PlannerCalendarEventRow[]>(key, (current) =>
        current?.map((event) =>
          event.id === id ? { ...event, ...toRow(input) } : event
        )
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const birthdayId = id.startsWith("collection:") ? id.slice(11) : null;
      const { error } = birthdayId
        ? await requireSupabase().from("test_collection_calendar_events").delete().eq("id", birthdayId)
        : await requireSupabase().from("calendar_events").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlannerCalendarEventRow[]>(key);
      queryClient.setQueryData<PlannerCalendarEventRow[]>(key, (current) =>
        current?.filter((event) => event.id !== id)
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: invalidate,
  });

  return { ...query, create, update, remove };
}
