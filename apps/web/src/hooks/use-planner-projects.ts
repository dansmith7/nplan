import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { isTauriRuntime, requireSupabase } from "@/lib/supabase";

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
const maxDocumentSize = 50 * 1024 * 1024;
const bucket = () => requireSupabase().storage.from("project-documents");

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

type ProjectDocument = { key: string; name: string; size?: number };

function documentKey(name: string) {
  const bytes = new TextEncoder().encode(name);
  if (bytes.length > 512)
    throw new Error("Сократите имя файла и попробуйте снова.");
  // Storage keys use ASCII. Keep the original filename, including Cyrillic,
  // in a reversible suffix so the upload and its listing are one operation.
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${crypto.randomUUID()}-${encoded}`;
}

function documentName(key: string) {
  try {
    const bytes = atob(key.slice(37).replace(/-/g, "+").replace(/_/g, "/"));
    return (
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(bytes, (character) => character.charCodeAt(0))
      ) || key
    );
  } catch {
    return key;
  }
}

export function useProjectDocuments(projectId: string) {
  const queryClient = useQueryClient();
  const { session } = useSupabaseSession();
  const folder = `${session?.user.id}/${projectId}`;
  const key = [
    "uploads",
    "project-documents",
    session?.user.id,
    projectId,
  ] as const;

  const documents = useQuery({
    queryKey: key,
    enabled: Boolean(session),
    refetchOnMount: "always",
    queryFn: async () => {
      const results: ProjectDocument[] = [];
      const limit = 100;
      for (let offset = 0; ; offset += limit) {
        const { data, error } = await bucket().list(folder, {
          limit,
          offset,
          sortBy: { column: "created_at", order: "desc" },
        });
        if (error) throw error;
        for (const item of data) {
          if (item.id)
            results.push({
              key: item.name,
              name: documentName(item.name),
              size:
                typeof item.metadata?.size === "number"
                  ? item.metadata.size
                  : undefined,
            });
        }
        if (data.length < limit) return results;
      }
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > maxDocumentSize)
        throw new Error("Размер файла превышает 50 МБ.");
      if (!file.size) throw new Error("Выберите непустой файл.");
      const { error } = await bucket().upload(
        `${folder}/${documentKey(file.name)}`,
        file,
        {
          contentType: file.type || "application/octet-stream",
        }
      );
      if (error)
        throw new Error("Не удалось загрузить файл. Попробуйте ещё раз.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const download = useMutation({
    mutationFn: async (file: ProjectDocument) => {
      const { data, error } = await bucket().createSignedUrl(
        `${folder}/${file.key}`,
        60,
        { download: file.name }
      );
      if (error) throw error;
      if (isTauriRuntime) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("plugin:shell|open", { path: data.signedUrl });
      } else {
        const link = document.createElement("a");
        link.href = data.signedUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (file: ProjectDocument) => {
      const { error } = await bucket().remove([`${folder}/${file.key}`]);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { ...documents, upload, download, remove };
}
