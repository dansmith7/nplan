import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { requireSupabase } from "@/lib/supabase";

export type ProjectStatus = "planned" | "active" | "completed";

export type ProjectInput = {
  title: string;
  description: string;
  status: ProjectStatus;
  category_id: string;
  due_date: string | null;
};

export type PlannerProject = ProjectInput & { id: string };

const projectFields = "id, title, description, status, category_id, due_date";

export function usePlannerProjects(enabled = true) {
  const queryClient = useQueryClient();
  const { isConfigured, session } = useSupabaseSession();
  const key = ["planner", "projects", session?.user.id] as const;

  const projects = useQuery({
    queryKey: key,
    enabled: enabled && Boolean(session),
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("projects")
        .select(projectFields)
        .order("updated_at", { ascending: false })
        .returns<PlannerProject[]>();
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ProjectInput }) => {
      const table = requireSupabase().from("projects");
      const query = id ? table.update(input).eq("id", id) : table.insert(input);
      const { data, error } = await query
        .select(projectFields)
        .single<PlannerProject>();
      if (error) throw error;
      return data;
    },
    onSuccess: (project) => {
      queryClient.setQueryData<PlannerProject[]>(key, (old) => [
        project,
        ...(old ?? []).filter(({ id }) => id !== project.id),
      ]);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return { ...projects, save, isConfigured };
}
