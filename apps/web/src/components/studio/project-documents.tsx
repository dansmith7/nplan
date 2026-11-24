import {
  Download,
  FileText,
  FolderInput,
  Pencil,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { Progress } from "@/components/arc/progress/progress";
import { useId, useRef, useState, type FormEvent } from "react";
import {
  useProjectDocuments,
  useProjectDocumentSections,
  type ProjectDocument,
  type UploadResult,
} from "@/hooks/use-project-documents";

type FileAction = { kind: "move" | "remove"; key: string };
type SectionDraft = { id?: string; name: string };

export function ProjectDocuments({ projectId }: { projectId: string }) {
  const sections = useProjectDocumentSections(projectId);
  const [sectionId, setSectionId] = useState("");
  const documents = useProjectDocuments(projectId, sectionId);
  const input = useRef<HTMLInputElement>(null);
  const sectionSelectId = useId();
  const [error, setError] = useState("");
  const [uploadResult, setUploadResult] = useState<UploadResult>();
  const [uploadProgress, setUploadProgress] = useState<{
    processed: number;
    total: number;
  }>();
  const [sectionDraft, setSectionDraft] = useState<SectionDraft>();
  const [fileAction, setFileAction] = useState<FileAction>();
  const activeSection = sections.data?.find(({ id }) => id === sectionId);
  const busy =
    sections.save.isPending ||
    documents.upload.isPending ||
    documents.download.isPending ||
    documents.move.isPending ||
    documents.remove.isPending;

  const destinations = [
    { id: "", name: "Без раздела" },
    ...(sections.data ?? []),
  ];

  function changeSection(id: string) {
    setSectionId(id);
    setSectionDraft(undefined);
    setFileAction(undefined);
    setUploadResult(undefined);
    setError("");
  }

  async function saveSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sectionDraft || busy) return;
    const name = sectionDraft.name.trim();
    if (!name) return;
    if (name.toLocaleLowerCase("ru") === "без раздела") {
      setError("Название «Без раздела» уже используется.");
      return;
    }
    setError("");
    try {
      const section = await sections.save.mutateAsync({
        id: sectionDraft.id,
        name,
      });
      changeSection(section.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось сохранить раздел."
      );
    }
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || busy) return;
    setError("");
    setUploadResult(undefined);
    try {
      setUploadProgress({ processed: 0, total: files.length });
      setUploadResult(
        await documents.upload.mutateAsync({
          files,
          onProcessed: (processed) =>
            setUploadProgress({ processed, total: files.length }),
        })
      );
    } catch {
      setError("Не удалось загрузить файлы. Попробуйте ещё раз.");
    } finally {
      setUploadProgress(undefined);
    }
  }

  async function moveFile(
    event: FormEvent<HTMLFormElement>,
    file: ProjectDocument
  ) {
    event.preventDefault();
    if (busy) return;
    const destination = new FormData(event.currentTarget).get("destination");
    if (typeof destination !== "string" || destination === sectionId) return;
    setError("");
    try {
      await documents.move.mutateAsync({ file, destination });
      setFileAction(undefined);
    } catch {
      setError("Не удалось переместить файл. Попробуйте ещё раз.");
    }
  }

  async function removeFile(file: ProjectDocument) {
    if (busy) return;
    setError("");
    try {
      await documents.remove.mutateAsync(file);
      setFileAction(undefined);
    } catch {
      setError("Не удалось удалить файл. Попробуйте ещё раз.");
    }
  }

  return (
    <section className="project-panel" aria-label="Документы проекта">
      <div className="project-panel-title">
        <h2>Документы</h2>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void uploadFiles(files);
          }}
        />
        <button
          type="button"
          className="project-action"
          disabled={busy || documents.isError}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} /> Загрузить файлы
        </button>
      </div>

      <div className="project-document-toolbar">
        <div className="project-document-section">
          <label htmlFor={sectionSelectId}>Раздел документов</label>
          <select
            className="project-document-select"
            id={sectionSelectId}
            value={sectionId}
            disabled={busy}
            onChange={(event) => changeSection(event.target.value)}
          >
            {destinations.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        {activeSection && (
          <button
            type="button"
            className="project-action project-icon-action"
            aria-label="Переименовать раздел"
            title="Переименовать раздел"
            disabled={busy}
            onClick={() => {
              setError("");
              setSectionDraft(activeSection);
            }}
          >
            <Pencil size={16} />
          </button>
        )}
        <button
          type="button"
          className="project-action"
          disabled={busy || !sections.isSuccess}
          onClick={() => {
            setError("");
            setSectionDraft({ name: "" });
          }}
        >
          <Plus size={16} /> Новый раздел
        </button>
      </div>

      {sections.isError && (
        <p className="project-hint">
          Разделы недоступны.{" "}
          <button
            type="button"
            className="project-action"
            onClick={() => void sections.refetch()}
          >
            Повторить загрузку разделов
          </button>
        </p>
      )}

      {sectionDraft && (
        <form
          className="project-document-form"
          onSubmit={(event) => void saveSection(event)}
        >
          <label>
            Название раздела
            <input
              className="project-document-select"
              required
              maxLength={80}
              value={sectionDraft.name}
              placeholder="Например, Договоры"
              disabled={sections.save.isPending}
              onChange={(event) =>
                setSectionDraft({ ...sectionDraft, name: event.target.value })
              }
            />
          </label>
          <div className="project-confirm">
            <button
              type="button"
              className="project-action"
              disabled={busy}
              onClick={() => {
                setSectionDraft(undefined);
                setError("");
              }}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="project-action project-primary"
              disabled={busy || !sectionDraft.name.trim()}
            >
              {sections.save.isPending
                ? "Сохраняю…"
                : sectionDraft.id
                  ? "Сохранить название"
                  : "Создать раздел"}
            </button>
          </div>
        </form>
      )}

      {uploadProgress && (
        <div className="project-upload-progress" data-theme="dark">
          <Progress
            value={uploadProgress.processed}
            max={uploadProgress.total}
            label={`Обработано ${uploadProgress.processed} из ${uploadProgress.total}`}
          />
        </div>
      )}
      {error && (
        <p className="project-error" role="alert">
          {error}
        </p>
      )}
      {uploadResult && uploadResult.uploaded > 0 && (
        <p className="project-hint" role="status">
          Файлов загружено: {uploadResult.uploaded}
        </p>
      )}
      {uploadResult && uploadResult.failed.length > 0 && (
        <div className="project-error project-upload-errors" role="alert">
          <p>
            Не удалось загрузить {uploadResult.failed.length} из{" "}
            {uploadResult.uploaded + uploadResult.failed.length}.
          </p>
          <ul>
            {uploadResult.failed.map(({ name, reason }, index) => (
              <li key={index}>
                {name}. {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {documents.isPending ? (
        <p className="project-hint" role="status">
          Загружаю документы…
        </p>
      ) : documents.isError ? (
        <div className="project-empty">
          <p role="alert">Не удалось загрузить документы.</p>
          <button
            type="button"
            className="project-action"
            onClick={() => void documents.refetch()}
          >
            Повторить загрузку
          </button>
        </div>
      ) : !documents.data.length ? (
        <p className="project-hint">
          Здесь пока нет документов. Можно выбрать сразу несколько файлов до 50
          МБ каждый.
        </p>
      ) : (
        <ul className="project-rows">
          {documents.data.map((file) => (
            <li key={file.key} className="project-document">
              <div className="project-document-row">
                <FileText size={17} aria-hidden="true" />
                <span>
                  {file.name}
                  {file.size !== undefined && (
                    <small>{formatSize(file.size)}</small>
                  )}
                </span>
                <button
                  type="button"
                  className="project-action project-icon-action"
                  disabled={busy}
                  aria-label={`Скачать ${file.name}`}
                  title="Скачать"
                  onClick={() => {
                    setError("");
                    void documents.download
                      .mutateAsync(file)
                      .catch(() =>
                        setError("Не удалось скачать файл. Попробуйте ещё раз.")
                      );
                  }}
                >
                  <Download size={17} />
                </button>
                {destinations.length > 1 && (
                  <button
                    type="button"
                    className="project-action project-icon-action"
                    disabled={busy}
                    aria-label={`Переместить ${file.name}`}
                    title="Переместить"
                    onClick={() =>
                      setFileAction({ kind: "move", key: file.key })
                    }
                  >
                    <FolderInput size={17} />
                  </button>
                )}
                <button
                  type="button"
                  className="project-action project-icon-action"
                  disabled={busy}
                  aria-label={`Удалить ${file.name}`}
                  title="Удалить"
                  onClick={() =>
                    setFileAction({ kind: "remove", key: file.key })
                  }
                >
                  <X size={16} />
                </button>
              </div>

              {fileAction?.key === file.key && fileAction.kind === "move" && (
                <form
                  className="project-document-form"
                  onSubmit={(event) => void moveFile(event, file)}
                >
                  <label>
                    Куда переместить
                    <select
                      className="project-document-select"
                      name="destination"
                      defaultValue={
                        destinations.find(({ id }) => id !== sectionId)?.id
                      }
                      disabled={busy}
                    >
                      {destinations
                        .filter(({ id }) => id !== sectionId)
                        .map(({ id, name }) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="project-confirm">
                    <button
                      type="button"
                      className="project-action"
                      disabled={busy}
                      onClick={() => setFileAction(undefined)}
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="project-action project-primary"
                      disabled={busy}
                    >
                      {documents.move.isPending ? "Перемещаю…" : "Переместить"}
                    </button>
                  </div>
                </form>
              )}

              {fileAction?.key === file.key && fileAction.kind === "remove" && (
                <div className="project-confirm">
                  <span>Удалить файл из проекта?</span>
                  <button
                    type="button"
                    className="project-action"
                    disabled={busy}
                    onClick={() => setFileAction(undefined)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="project-action"
                    disabled={busy}
                    onClick={() => void removeFile(file)}
                  >
                    Удалить
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}
