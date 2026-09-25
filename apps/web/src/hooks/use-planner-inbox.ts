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

const inboxKey = (userId?: string) => ["planner", "inbox", userId] as const;

async function getInbox(): Promise<PlannerInboxRow[]> {
  const { data, error } = await requireSupabase()
    .from("inbox_items")
    .select("id, source, title, raw_text, transcript, received_at, status, promoted_task_id")
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
    () => queryClient.invalidateQueries({ queryKey: key }),
    [key, queryClient]
  );
  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase()
        .from("inbox_items")
        .update({ status: "dismissed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const markPromoted = useMutation({
    mutationFn: async ({ id, taskId }: { id: string; taskId: string }) => {
      const { error } = await requireSupabase()
        .from("inbox_items")
        .update({ status: "promoted", promoted_task_id: taskId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...query, dismiss, markPromoted };
}

