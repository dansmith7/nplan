import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

export type PlannerInboxRow = {
  id: string;
  source: "telegram" | "yandex_mail";
  title: string;
  raw_text: string | null;
  transcript: string | null;
  received_at: string;
  status: "new" | "dismissed" | "promoted";
  promoted_task_id: string | null;
};

type PromoteInboxInput = {
  id: string;
  categoryId: string;
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  recurrence?: "none" | "weekly" | "monthly";
};

const inboxKey = (userId?: string) => ["planner", "inbox", userId] as const;

async function getInbox(): Promise<PlannerInboxRow[]> {
  const { data, error } = await requireSupabase()
    .from("inbox_items")
    .select(
      "id, source, title, raw_text, transcript, received_at, status, promoted_task_id"
    )
    .eq("status", "new")
    .order("received_at", { ascending: false })
    .limit(50)
    .returns<PlannerInboxRow[]>();
  if (error) throw error;
  return data;
}

export function usePlannerInbox() {
  const queryClient = useQueryClient();
  const { isConfigured, session } = useSupabaseSession();
  const key = inboxKey(session?.user.id);
  const query = useQuery({
    queryKey: key,
    queryFn: getInbox,
    enabled: isConfigured && Boolean(session?.user.id),
    staleTime: 30_000,
  });
  const invalidate = React.useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({
          queryKey: ["planner", "tasks", session?.user.id],
        }),
      ]),
    [key, queryClient, session?.user.id]
  );
  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase()
        .from("inbox_items")
        .update({ status: "dismissed" })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlannerInboxRow[]>(key);
      queryClient.setQueryData<PlannerInboxRow[]>(key, (current) =>
        current?.filter((item) => item.id !== id)
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: invalidate,
  });
  const promote = useMutation({
    mutationFn: async (input: PromoteInboxInput) => {
      const { data, error } = await requireSupabase().rpc(
        "promote_inbox_item",
        {
          p_inbox_id: input.id,
          p_category_id: input.categoryId,
          p_title: input.title.trim(),
          p_due_date: input.dueDate || null,
          p_due_time: input.dueTime || null,
          p_recurrence: input.recurrence ?? "none",
        }
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });

  return { ...query, dismiss, promote };
}
