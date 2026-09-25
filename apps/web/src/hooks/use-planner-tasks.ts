import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

export type PlannerTaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: "in_progress" | "completed";
  due_date: string | null;
  due_time: string | null;
  recurrence: "none" | "weekly" | "monthly";
  category: { id: string; name: string } | null;
};

type TaskInput = {
  title: string;
  description?: string | null;
  categoryId: string;
  dueDate?: string | null;
  dueTime?: string | null;
  recurrence?: "none" | "weekly" | "monthly";
};

const taskKey = (userId?: string) => ["planner", "tasks", userId] as const;

async function getPlannerTasks(): Promise<PlannerTaskRow[]> {
  const { data, error } = await requireSupabase()
    .from("tasks")
    .select(
      "id, title, description, status, due_date, due_time, recurrence, category:categories(id, name)"
    )
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .returns<PlannerTaskRow[]>();

  if (error) throw error;
  return data;
}

export function usePlannerTasks() {
  const queryClient = useQueryClient();
  const { isConfigured, session } = useSupabaseSession();
  const key = taskKey(session?.user.id);
  const tasksQuery = useQuery({
    queryKey: key,
    queryFn: getPlannerTasks,
    enabled: isConfigured && Boolean(session?.user.id),
    staleTime: 30_000,
  });

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: key }),
    [key, queryClient]
  );

  const create = useMutation({
    mutationFn: async (input: TaskInput) => {
      const { error } = await requireSupabase().from("tasks").insert({
        title: input.title,
        description: input.description ?? null,
        category_id: input.categoryId,
        due_date: input.dueDate || null,
        due_time: input.dueTime || null,
        recurrence: input.recurrence ?? "none",
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: TaskInput & { id: string }) => {
      const { error } = await requireSupabase()
        .from("tasks")
        .update({
          title: input.title,
          description: input.description ?? null,
          category_id: input.categoryId,
          due_date: input.dueDate || null,
          due_time: input.dueTime || null,
          recurrence: input.recurrence ?? "none",
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setCompleted = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await requireSupabase()
        .from("tasks")
        .update({
          status: completed ? "completed" : "in_progress",
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...tasksQuery, create, update, setCompleted };
}
