import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

export type MovieStatus =
  | "want_to_watch"
  | "watching"
  | "watched"
  | "postponed";

type MovieDetails = {
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
  genres: string[];
  director: string | null;
  external_rating: number | null;
  watch_provider: string | null;
  trailer_url: string | null;
  recommended_by: string | null;
  personal_rating: number | null;
  status: MovieStatus;
};

export type PlannerMovie = {
  id: string;
  title: string;
  note: string | null;
  source_url: string | null;
  image_url: string | null;
  promoted_task_id: string | null;
  calendar_event_id: string | null;
  created_at: string;
  movie: MovieDetails;
};

export type MovieInput = {
  title: string;
  originalTitle?: string;
  releaseYear?: number | null;
  durationMinutes?: number | null;
  genres?: string[];
  director?: string;
  imageUrl?: string;
  sourceUrl?: string;
  note?: string;
  recommendedBy?: string;
  status: MovieStatus;
};

type MovieQueryRow = Omit<PlannerMovie, "movie"> & {
  movie: MovieDetails | MovieDetails[];
};

const moviesKey = (userId?: string) =>
  ["planner", "collections", "movies", userId] as const;

async function getMovies(): Promise<PlannerMovie[]> {
  const { data, error } = await requireSupabase()
    .from("test_collection_items")
    .select(
      "id, title, note, source_url, image_url, promoted_task_id, calendar_event_id, created_at, movie:test_collection_movies(original_title, release_year, duration_minutes, genres, director, external_rating, watch_provider, trailer_url, recommended_by, personal_rating, status)"
    )
    .eq("type", "movie")
    .order("created_at", { ascending: false })
    .returns<MovieQueryRow[]>();
  if (error) throw error;
  return data.flatMap((row) => {
    const movie = Array.isArray(row.movie) ? row.movie[0] : row.movie;
    return movie ? [{ ...row, movie }] : [];
  });
}

const rpcInput = (input: MovieInput) => ({
  p_title: input.title.trim(),
  p_original_title: input.originalTitle?.trim() || null,
  p_release_year: input.releaseYear ?? null,
  p_duration_minutes: input.durationMinutes ?? null,
  p_genres: input.genres ?? [],
  p_director: input.director?.trim() || null,
  p_image_url: input.imageUrl?.trim() || null,
  p_source_url: input.sourceUrl?.trim() || null,
  p_note: input.note?.trim() || null,
  p_recommended_by: input.recommendedBy?.trim() || null,
  p_status: input.status,
});

export function usePlannerMovies() {
  const queryClient = useQueryClient();
  const { isConfigured, session } = useSupabaseSession();
  const key = moviesKey(session?.user.id);
  const query = useQuery({
    queryKey: key,
    queryFn: getMovies,
    enabled: isConfigured && Boolean(session?.user.id),
    staleTime: 30_000,
  });
  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: key }),
    [key, queryClient]
  );

  const create = useMutation({
    mutationFn: async (input: MovieInput) => {
      const { data, error } = await requireSupabase().rpc(
        "test_create_collection_movie",
        rpcInput(input)
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: MovieInput & { id: string }) => {
      const { error } = await requireSupabase().rpc(
        "test_update_collection_movie",
        { p_item_id: id, ...rpcInput(input) }
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase()
        .from("test_collection_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...query, create, update, remove };
}
