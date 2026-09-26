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
  metadata: Record<string, unknown> | null;
};

export type InboxCollectionType =
  | "movie"
  | "purchase"
  | "birthday"
  | "place"
  | "learning"
  | "idea";

type PromoteInboxInput = {
  id: string;
  categoryId: string;
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  recurrence?: "none" | "weekly" | "monthly";
};

const inboxKey = (userId?: string) => ["planner", "inbox", userId] as const;

function movieMetadata(metadata: Record<string, unknown> | null) {
  const value = metadata?.movie;
  if (!value || typeof value !== "object") return null;
  const movie = value as Record<string, unknown>;
  return {
    originalTitle:
      typeof movie.originalTitle === "string" ? movie.originalTitle : null,
    releaseYear: typeof movie.year === "number" ? movie.year : null,
    genres: Array.isArray(movie.genres)
      ? movie.genres.filter((genre): genre is string => typeof genre === "string")
      : [],
    rating:
      typeof movie.ratingKinopoisk === "number" ? movie.ratingKinopoisk : null,
    kinopoiskId:
      typeof movie.kinopoiskId === "number" ? movie.kinopoiskId : null,
    sourceUrl: typeof movie.sourceUrl === "string" ? movie.sourceUrl : null,
    posterUrl: typeof movie.posterUrl === "string" ? movie.posterUrl : null,
  };
}

async function getInbox(): Promise<PlannerInboxRow[]> {
  const supabase = requireSupabase();
  const [inboxResult, routedResult] = await Promise.all([
    supabase
      .from("inbox_items")
      .select(
        "id, source, title, raw_text, transcript, received_at, status, promoted_task_id, metadata"
      )
      .eq("status", "new")
      .order("received_at", { ascending: false })
      .limit(50)
      .returns<PlannerInboxRow[]>(),
    supabase.from("test_collection_inbox_links").select("inbox_id"),
  ]);
  if (inboxResult.error) throw inboxResult.error;
  if (routedResult.error) throw routedResult.error;
  const routedIds = new Set(
    (routedResult.data ?? []).map((item) => item.inbox_id as string)
  );
  return inboxResult.data.filter((item) => !routedIds.has(item.id));
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

  const collect = useMutation({
    mutationFn: async ({
      item,
      type,
    }: {
      item: PlannerInboxRow;
      type: InboxCollectionType;
    }) => {
      const movie = type === "movie" ? movieMetadata(item.metadata) : null;
      const { data, error } = await requireSupabase().rpc(
        "test_route_inbox_to_collection",
        {
          p_inbox_id: item.id,
          p_type: type,
          p_title: item.title.trim(),
          p_note: item.transcript || item.raw_text || null,
          p_source_url: movie?.sourceUrl ?? null,
          p_image_url: movie?.posterUrl ?? null,
          p_original_title: movie?.originalTitle ?? null,
          p_release_year: movie?.releaseYear ?? null,
          p_genres: movie?.genres ?? [],
          p_external_rating: movie?.rating ?? null,
          p_kinopoisk_id: movie?.kinopoiskId ?? null,
        }
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: () =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({
          queryKey: ["planner", "collections"],
        }),
      ]),
  });

  return { ...query, dismiss, promote, collect };
}
