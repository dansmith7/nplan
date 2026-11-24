import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Download,
  FileText,
  FolderOpen,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import {
  type usePlannerProjects,
  useProjectDocuments,
  type PlannerProject,
  type ProjectInput,
  type ProjectStatus,
} from "@/hooks/use-planner-projects";
import {
  usePlannerTasks,
  type PlannerTaskRow,
} from "@/hooks/use-planner-tasks";
import type { PlannerCategory } from "@/lib/planner-data";
import "./planner-projects-screen.css";

const statuses: Record<ProjectStatus, string> = {
  planned: "Запланирован",
  active: "В работе",
  completed: "Завершён",
};

const dateLabel = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(date: string) {
  return dateLabel.format(new Date(`${date}T12:00:00`));
}

function CategoryLabel({ name, order }: { name: string; order: number }) {
  return (
    <span className="project-category" data-order={order}>
      {name}
    </span>
  );
}

type Props = {
  projects: ReturnType<typeof usePlannerProjects>;
  initialCategoryId?: string;
  initialProjectId?: string;
  categories: PlannerCategory[];
  today: string;
  onCreateTask: (project: PlannerProject) => void;
  onOpenTask: (task: PlannerTaskRow) => void;
};

export function PlannerProjectsScreen({
  projects,
  initialCategoryId,
  initialProjectId,
  categories,
  today,
  onCreateTask,
  onOpenTask,
}: Props) {
  const categoryFilterId = useId();
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? "");
  const [selectedId, setSelectedId] = useState(initialProjectId);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editing, setEditing] = useState<PlannerProject | "new" | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const selected = projects.data?.find(({ id }) => id === selectedId);
  const selectedCategory = categories.find(
    (item) => item.id === selected?.category_id
  );
  const activeCategory = categories.find((item) => item.id === categoryId);
  const items =
    projects.data?.filter(
      (project) =>
        (project.status === "completed") === showCompleted &&
        (!categoryId || project.category_id === categoryId)
    ) ?? [];
  const groups = activeCategory
    ? [{ category: activeCategory, items }]
    : categories
        .map((category) => ({
          category,
          items: items.filter((project) => project.category_id === category.id),
        }))
        .filter((group) => group.items.length > 0);

  const startEditing = (
    project: PlannerProject | "new",
    button: HTMLElement
  ) => {
    trigger.current = button;
    setEditing(project);
  };

  return (
    <div className="projects-screen">
      {selected ? (
        <div key={selected.id}>
          <button
            type="button"
            className="project-action project-back"
            onClick={() => setSelectedId(undefined)}
          >
            <ArrowLeft size={16} />{" "}
            {activeCategory ? "Проекты направления" : "Все проекты"}
          </button>
          <header className="project-cover">
            <div className="project-meta">
              {selectedCategory && (
                <CategoryLabel
                  name={selectedCategory.name}
                  order={selectedCategory.sort_order}
                />
              )}
              <span className="project-status">
                {statuses[selected.status]}
              </span>
            </div>
            <h1>{selected.title}</h1>
            {selected.description && (
              <p className="project-description">{selected.description}</p>
            )}
            {selected.due_date && (
              <p
                className="project-deadline"
                data-tone={
                  selected.status !== "completed"
                    ? deadlineTone(selected.due_date, today)
                    : undefined
                }
              >
                Срок · {formatDate(selected.due_date)}
              </p>
            )}
            <button
              type="button"
              className="project-action"
              onClick={(event) => startEditing(selected, event.currentTarget)}
            >
              Редактировать проект
            </button>
          </header>
          <div className="project-workspace">
            <ProjectTasks
              project={selected}
              today={today}
              onCreate={() => onCreateTask(selected)}
              onOpen={onOpenTask}
            />
            <ProjectDocuments projectId={selected.id} />
          </div>
        </div>
      ) : (
        <>
          <header className="projects-heading">
            <div>
              <h1>
                {activeCategory
                  ? `Проекты · ${activeCategory.name}`
                  : "Проекты"}
              </h1>
            </div>
            {projects.isConfigured && (
              <button
                type="button"
                className="project-action project-primary"
                disabled={!categories.length || projects.isError}
                onClick={(event) => startEditing("new", event.currentTarget)}
              >
                <Plus size={17} /> Новый проект
              </button>
            )}
          </header>
          <div className="project-toolbar">
            <div
              className="project-filters"
              role="group"
              aria-label="Фильтр проектов"
            >
              <button
                type="button"
                aria-pressed={!showCompleted}
                onClick={() => setShowCompleted(false)}
              >
                Текущие
              </button>
              <button
                type="button"
                aria-pressed={showCompleted}
                onClick={() => setShowCompleted(true)}
              >
                Завершённые
              </button>
            </div>
            <div className="project-category-filter">
              <label htmlFor={categoryFilterId}>Направление</label>
              <select
                id={categoryFilterId}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Все направления</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!projects.isConfigured ? (
            <p className="project-empty">
              Подключите хранилище NPlan, чтобы создавать проекты.
            </p>
          ) : projects.isPending ? (
            <p className="project-empty" role="status">
              Загружаю проекты…
            </p>
          ) : projects.isError ? (
            <Retry
              message="Не удалось загрузить проекты."
              onRetry={() => void projects.refetch()}
            />
          ) : items.length === 0 ? (
            <div className="project-empty">
              <FolderOpen size={24} aria-hidden="true" />
              <h2>
                {showCompleted
                  ? "Завершённых проектов пока нет"
                  : "Текущих проектов пока нет"}
              </h2>
              <p>
                {showCompleted
                  ? "Здесь появятся проекты со статусом «Завершён»."
                  : "Создайте проект и добавьте к нему первые задачи и документы."}
              </p>
            </div>
          ) : (
            <div className="project-groups" data-grouped={!activeCategory}>
              {groups.map(({ category, items: groupItems }) => (
                <section key={category.id} aria-label={category.name}>
                  {!activeCategory && (
                    <h2 className="project-group-heading">
                      <CategoryLabel
                        name={category.name}
                        order={category.sort_order}
                      />
                    </h2>
                  )}
                  <div className="project-grid">
                    {groupItems.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        className="project-card"
                        onClick={() => setSelectedId(project.id)}
                      >
                        <span className="project-card-lead">
                          <span className="project-card-title">
                            {project.title}
                          </span>
                          <ArrowUpRight size={18} aria-hidden="true" />
                        </span>
                        {project.description && (
                          <span className="project-card-description">
                            {project.description}
                          </span>
                        )}
                        <span className="project-card-footer">
                          <span className="project-status">
                            {statuses[project.status]}
                          </span>
                          {project.due_date && (
                            <span
                              data-tone={
                                showCompleted
                                  ? undefined
                                  : deadlineTone(project.due_date, today)
                              }
                            >
                              {formatDate(project.due_date)}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      {editing && (
        <ProjectEditor
          project={editing === "new" ? undefined : editing}
          categories={categories}
          defaultCategoryId={activeCategory?.id}
          onClose={() => setEditing(null)}
          restoreFocus={() => trigger.current?.focus()}
          onSave={async (input) => {
            const saved = await projects.save.mutateAsync({
              input,
              id: editing === "new" ? undefined : editing.id,
            });
            setSelectedId(saved.id);
            if (categoryId) setCategoryId(saved.category_id);
            setShowCompleted(saved.status === "completed");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function deadlineTone(date: string, today: string) {
  if (date < today) return "overdue";
  if (date === today) return "today";
  return undefined;
}

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="project-empty">
      <p role="alert">{message}</p>
      <button type="button" className="project-action" onClick={onRetry}>
        Повторить загрузку
      </button>
    </div>
  );
}

function ProjectEditor({
  project,
  categories,
  defaultCategoryId,
  onSave,
  onClose,
  restoreFocus,
}: {
  project?: PlannerProject;
  defaultCategoryId?: string;
  categories: PlannerCategory[];
  onSave: (input: ProjectInput) => Promise<void>;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [title, setTitle] = useState(project?.title ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !title.trim()) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(false);
    try {
      await onSave({
        title: title.trim(),
        description: String(form.get("description")).trim(),
        category_id: String(form.get("category")),
        status: form.get("status") as ProjectStatus,
        due_date: String(form.get("due") ?? "") || null,
      });
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="project-editor-overlay" />
        <Dialog.Content
          className="planner-modal project-editor"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
        >
          <form onSubmit={submit}>
            <div className="project-panel-title">
              <Dialog.Title>
                {project ? "Редактировать проект" : "Новый проект"}
              </Dialog.Title>
              <Dialog.Close
                className="project-action project-icon-action"
                aria-label="Закрыть"
                disabled={saving}
              >
                <X size={18} />
              </Dialog.Close>
            </div>
            <label>
              Название
              <input
                name="title"
                required
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Например, подготовить поставку"
              />
            </label>
            <label>
              Описание
              <textarea
                name="description"
                defaultValue={project?.description}
                maxLength={4000}
                rows={3}
                placeholder="Что должно получиться?"
              />
            </label>
            <div className="modal-two-columns">
              <label>
                Направление
                <select
                  name="category"
                  required
                  defaultValue={
                    project?.category_id ??
                    defaultCategoryId ??
                    categories.find((item) => item.name === "Личное")?.id
                  }
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Статус
                <select
                  name="status"
                  defaultValue={project?.status ?? "active"}
                >
                  {Object.entries(statuses).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Срок
              <input
                type="date"
                name="due"
                defaultValue={project?.due_date ?? ""}
              />
            </label>
            {error && (
              <p className="project-error" role="alert">
                Не удалось сохранить проект. Попробуйте ещё раз.
              </p>
            )}
            <button
              type="submit"
              className="project-action project-primary"
              disabled={saving || !title.trim()}
            >
              {saving
                ? "Сохраняю…"
                : project
                  ? "Сохранить проект"
                  : "Создать проект"}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ProjectTasks({
  project,
  today,
  onCreate,
  onOpen,
}: {
  project: PlannerProject;
  today: string;
  onCreate: () => void;
  onOpen: (task: PlannerTaskRow) => void;
}) {
  const tasks = usePlannerTasks(project.id);
  const [error, setError] = useState(false);

  async function toggle(task: PlannerTaskRow) {
    setError(false);
    try {
      await tasks.setCompleted.mutateAsync({
        id: task.id,
        completed: task.status !== "completed",
      });
    } catch {
      setError(true);
    }
  }

  return (
    <section className="project-panel" aria-label="Задачи проекта">
      <div className="project-panel-title">
        <h2>Задачи</h2>
        <button
          type="button"
          className="project-action project-primary"
          onClick={onCreate}
        >
          <Plus size={16} /> Добавить задачу
        </button>
      </div>
      {error && (
        <p className="project-error" role="alert">
          Не удалось изменить задачу. Попробуйте ещё раз.
        </p>
      )}
      {tasks.isPending ? (
        <p className="project-hint" role="status">
          Загружаю задачи…
        </p>
      ) : tasks.isError ? (
        <Retry
          message="Не удалось загрузить задачи."
          onRetry={() => void tasks.refetch()}
        />
      ) : tasks.data.length === 0 ? (
        <p className="project-hint">Добавьте первый шаг по проекту.</p>
      ) : (
        <ul className="project-rows">
          {[...tasks.data]
            .sort(
              (a, b) =>
                Number(a.status === "completed") -
                Number(b.status === "completed")
            )
            .map((task) => {
              const done = task.status === "completed";
              return (
                <li key={task.id} className="project-task-row">
                  <button
                    type="button"
                    className="project-action project-check"
                    aria-label={`Задача «${task.title}» выполнена`}
                    aria-pressed={done}
                    disabled={tasks.setCompleted.isPending}
                    onClick={() => void toggle(task)}
                  >
                    <span aria-hidden="true">
                      {done && <Check size={13} />}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="project-task-open"
                    onClick={() => onOpen(task)}
                  >
                    <span
                      className={done ? "project-task-completed" : undefined}
                    >
                      {task.title}
                    </span>
                    {task.due_date && (
                      <small
                        data-tone={
                          done ? undefined : deadlineTone(task.due_date, today)
                        }
                      >
                        {formatDate(task.due_date)}
                      </small>
                    )}
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}

function ProjectDocuments({ projectId }: { projectId: string }) {
  const documents = useProjectDocuments(projectId);
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<string>();
  const busy =
    documents.upload.isPending ||
    documents.download.isPending ||
    documents.remove.isPending;

  return (
    <section className="project-panel" aria-label="Документы проекта">
      <div className="project-panel-title">
        <h2>Документы</h2>
        <input
          ref={input}
          type="file"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setMessage("");
            void documents.upload
              .mutateAsync(file)
              .catch((error: Error) => setMessage(error.message));
          }}
        />
        <button
          type="button"
          className="project-action"
          disabled={busy || documents.isError}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} /> Загрузить файл
        </button>
      </div>
      {documents.upload.isPending && (
        <p className="project-hint" role="status">
          Загружаю файл…
        </p>
      )}
      {message && (
        <p className="project-error" role="alert">
          {message}
        </p>
      )}
      {documents.isPending ? (
        <p className="project-hint" role="status">
          Загружаю документы…
        </p>
      ) : documents.isError ? (
        <Retry
          message="Не удалось загрузить документы."
          onRetry={() => void documents.refetch()}
        />
      ) : !documents.data.length ? (
        <p className="project-hint">
          Загрузите договор, спецификацию или другой важный файл до 50 МБ.
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
                    setMessage("");
                    void documents.download
                      .mutateAsync(file)
                      .catch(() =>
                        setMessage(
                          "Не удалось скачать файл. Попробуйте ещё раз."
                        )
                      );
                  }}
                >
                  <Download size={17} />
                </button>
                <button
                  type="button"
                  className="project-action project-icon-action"
                  disabled={busy}
                  aria-label={`Удалить ${file.name}`}
                  title="Удалить"
                  onClick={() => setPendingRemoval(file.key)}
                >
                  <X size={16} />
                </button>
              </div>
              {pendingRemoval === file.key && (
                <div className="project-confirm">
                  <span>Удалить файл из проекта?</span>
                  <button
                    type="button"
                    className="project-action"
                    disabled={busy}
                    onClick={() => setPendingRemoval(undefined)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="project-action"
                    disabled={busy}
                    onClick={() => {
                      setMessage("");
                      void documents.remove
                        .mutateAsync(file)
                        .then(() => setPendingRemoval(undefined))
                        .catch(() =>
                          setMessage(
                            "Не удалось удалить файл. Попробуйте ещё раз."
                          )
                        );
                    }}
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
