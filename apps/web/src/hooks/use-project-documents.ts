import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { isTauriRuntime, requireSupabase } from "@/lib/supabase";

export type ProjectDocumentSection = { id: string; name: string };
export type ProjectDocument = { key: string; name: string; size?: number };
export type UploadResult = {
  uploaded: number;
  failed: { name: string; reason: string }[];
};

const maxDocumentSize = 50 * 1024 * 1024;
const bucket = () => requireSupabase().storage.from("project-documents");

export function useProjectDocumentSections(projectId: string) {
  const queryClient = useQueryClient();
  const { session } = useSupabaseSession();
  const key = [
    "planner",
    "document-sections",
    session?.user.id,
    projectId,
  ] as const;

  const sections = useQuery({
    queryKey: key,
    enabled: Boolean(session),
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("project_document_sections")
        .select("id, name")
        .eq("project_id", projectId)
        .order("name")
        .returns<ProjectDocumentSection[]>();
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async ({ id, name }: { id?: string; name: string }) => {
      const table = requireSupabase().from("project_document_sections");
      const query = id
        ? table.update({ name }).eq("project_id", projectId).eq("id", id)
        : table.insert({ project_id: projectId, name });
      const { data, error } = await query
        .select("id, name")
        .single<ProjectDocumentSection>();
      if (error?.code === "23505")
        throw new Error("Раздел с таким названием уже есть.");
      if (error)
        throw new Error("Не удалось сохранить раздел. Попробуйте ещё раз.");
      return data;
    },
    onSuccess: (section) => {
      queryClient.setQueryData<ProjectDocumentSection[]>(key, (previous) =>
        [
          ...(previous ?? []).filter(({ id }) => id !== section.id),
          section,
        ].sort((a, b) => a.name.localeCompare(b.name, "ru"))
      );
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return { ...sections, save };
}

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

export function useProjectDocuments(projectId: string, sectionId: string) {
  const queryClient = useQueryClient();
  const { session } = useSupabaseSession();
  const projectFolder = `${session?.user.id}/${projectId}`;
  const folderFor = (section: string) =>
    section ? `${projectFolder}/${section}` : projectFolder;
  const folder = folderFor(sectionId);
  const projectKey = [
    "uploads",
    "project-documents",
    session?.user.id,
    projectId,
  ] as const;
  const key = [...projectKey, sectionId] as const;

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
    mutationFn: async ({
      files,
      onProcessed,
    }: {
      files: File[];
      onProcessed: (count: number) => void;
    }): Promise<UploadResult> => {
      const result: UploadResult = { uploaded: 0, failed: [] };
      const parallelUploads = 3;
      let processed = 0;

      for (let offset = 0; offset < files.length; offset += parallelUploads) {
        const batch = files.slice(offset, offset + parallelUploads);
        const uploads = await Promise.allSettled(
          batch.map((file) =>
            uploadFile(folder, file).finally(() => onProcessed(++processed))
          )
        );
        uploads.forEach((upload, index) => {
          if (upload.status === "fulfilled") {
            result.uploaded += 1;
          } else {
            result.failed.push({
              name: batch[index]!.name,
              reason:
                upload.reason instanceof Error
                  ? upload.reason.message
                  : "Не удалось загрузить файл.",
            });
          }
        });
      }

      return result;
    },
    onSuccess: (result) => {
      if (result.uploaded > 0)
        return queryClient.invalidateQueries({ queryKey: key });
      return undefined;
    },
  });

  const move = useMutation({
    mutationFn: async ({
      file,
      destination,
    }: {
      file: ProjectDocument;
      destination: string;
    }) => {
      if (destination === sectionId) return;
      const { error } = await bucket().move(
        `${folder}/${file.key}`,
        `${folderFor(destination)}/${file.key}`
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKey }),
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

  return { ...documents, upload, download, move, remove };
}

async function uploadFile(folder: string, file: File) {
  if (file.size > maxDocumentSize)
    throw new Error("Размер файла превышает 50 МБ.");
  if (!file.size) throw new Error("Файл пуст.");
  const { error } = await bucket().upload(
    `${folder}/${documentKey(file.name)}`,
    file,
    {
      contentType: file.type || "application/octet-stream",
    }
  );
  if (error) throw new Error("Не удалось загрузить файл. Попробуйте ещё раз.");
}
