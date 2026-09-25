import { requireSupabase } from "@/lib/supabase";

export type PlannerProfile = {
  id: string;
  display_name: string | null;
  timezone: string;
  morning_review_time: string;
  evening_review_time: string;
};

export type PlannerCategory = {
  id: string;
  name: string;
  sort_order: number;
  icon_key: string | null;
};

export type PlannerBootstrap = {
  profile: PlannerProfile;
  categories: PlannerCategory[];
};

/** Fetches only the small, stable data needed to initialise the planner. */
export async function getPlannerBootstrap(): Promise<PlannerBootstrap> {
  const client = requireSupabase();
  const [profileResult, categoriesResult] = await Promise.all([
    client
      .from("profiles")
      .select("id, display_name, timezone, morning_review_time, evening_review_time")
      .single<PlannerProfile>(),
    client
      .from("categories")
      .select("id, name, sort_order, icon_key")
      .order("sort_order", { ascending: true })
      .returns<PlannerCategory[]>(),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (categoriesResult.error) throw categoriesResult.error;

  return {
    profile: profileResult.data,
    categories: categoriesResult.data,
  };
}
