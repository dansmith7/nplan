import * as React from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  FileText,
  Factory,
  GraduationCap,
  Inbox,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import "./studio-dashboard.css";
import { PlannerStudentsScreen } from "./planner-students-screen";
import { usePlannerBootstrap } from "@/hooks/use-planner-bootstrap";
import {
  type PlannerTaskRow,
  usePlannerTasks,
} from "@/hooks/use-planner-tasks";

type Screen = "planner" | "calendar" | "inbox" | "students";
type Category =
  | "Китай"
  | "Реестр"
  | "Личное"
  | "Производство"
  | "Финансы"
  | "Ученики";
type Task = {
  id: string;
  title: string;
  category: Category;
  due: "overdue" | "today" | "future";
  date: string;
  time?: string;
  repeat?: "Нет" | "Каждую неделю" | "Каждый месяц";
  done?: boolean;
  note?: string;
};
const categories: Category[] = [
  "Китай",
  "Реестр",
  "Личное",
  "Производство",
  "Финансы",
  "Ученики",
];
const categoryIcons: Record<Category, React.ReactNode> = {
  Китай: <span className="china-glyph">中</span>,
  Реестр: <img src="/minpromtorg-favicon.ico" alt="" />,
  Личное: <UserRound size={16} strokeWidth={1.7} />,
  Производство: <Factory size={16} strokeWidth={1.7} />,
  Финансы: <WalletCards size={16} strokeWidth={1.7} />,
  Ученики: <GraduationCap size={17} strokeWidth={1.7} />,
};
const initialTasks: Task[] = [
  {
    id: "1",
    title: "Проверить документы по поставке",
    category: "Китай",
    due: "overdue",
    date: "Вчера",
  },
  {
    id: "2",
    title: "Сверить статус заказа",
    category: "Китай",
    due: "today",
    date: "Сегодня",
  },
  {
    id: "3",
    title: "Подготовить заявление",
    category: "Реестр",
    due: "today",
    date: "Сегодня",
  },
  {
    id: "4",
    title: "Уточнить срок регистрации",
    category: "Реестр",
    due: "future",
    date: "29 сентября",
  },
  {
    id: "5",
    title: "Записаться к стоматологу",
    category: "Личное",
    due: "today",
    date: "Сегодня",
  },
  {
    id: "6",
    title: "Согласовать тираж",
    category: "Производство",
    due: "overdue",
    date: "22 сентября",
  },
  {
    id: "7",
    title: "Проверить смету",
    category: "Финансы",
    due: "future",
    date: "27 сентября",
  },
  {
    id: "8",
    title: "Подготовить материалы к уроку",
    category: "Ученики",
    due: "today",
    date: "Сегодня",
  },
];
type PlannerEvent = {
  id: string;
  day: number;
  top: number;
  title: string;
  time: string;
  kind: "lesson" | "task" | "event";
};
const events: PlannerEvent[] = [
  {
    id: "e1",
    day: 1,
    top: 17,
    title: "Занятие · Маша",
    time: "11:00",
    kind: "lesson",
  },
  {
    id: "e2",
    day: 2,
    top: 42,
    title: "Подготовить заявление",
    time: "14:30",
    kind: "task",
  },
  {
    id: "e3",
    day: 3,
    top: 24,
    title: "Созвон с поставщиком",
    time: "12:00",
    kind: "event",
  },
  {
    id: "e4",
    day: 4,
    top: 57,
    title: "Занятие · Лиза",
    time: "16:00",
    kind: "lesson",
  },
];
const inboxItems = [
  {
    source: "Telegram",
    title: "Попросила прислать счёт до пятницы",
    body: "Голосовое · расшифровка готова",
    type: "telegram",
  },
  {
    source: "Почта",
    title: "Документы для регистрации поставщика",
    body: "Письмо от Анны Петровой · 09:41",
    type: "mail",
  },
  {
    source: "Почта",
    title: "Новая версия договора",
    body: "Письмо от Ивана Смирнова · вчера",
    type: "mail",
  },
] as const;

export function StudioDashboard() {
  const plannerBootstrap = usePlannerBootstrap();
  const plannerTasks = usePlannerTasks();
  const displayName = plannerBootstrap.data?.profile.display_name;
  const headerName = displayName && !displayName.includes("@")
    ? displayName.split(" ")[0]
    : "Собранно.";
  const [screen, setScreen] = React.useState<Screen>("planner");
  const tasks = React.useMemo<Task[]>(() => {
    if (!plannerTasks.data) return [];
    return plannerTasks.data.flatMap((task) => {
      const category = task.category?.name as Category | undefined;
      if (!category || !categories.includes(category)) return [];
      return [{
        id: task.id,
        title: task.title,
        category,
        due: getDueTone(task.due_date),
        date: formatDueDate(task.due_date),
        time: task.due_time ?? undefined,
        repeat: recurrenceToLabel(task.recurrence),
        done: task.status === "completed",
        note: task.description ?? undefined,
      }];
    });
  }, [plannerTasks.data]);
  const categoryIds = React.useMemo(
    () => new Map(plannerBootstrap.data?.categories.map((item) => [item.name, item.id])),
    [plannerBootstrap.data?.categories]
  );
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [newTaskCategory, setNewTaskCategory] = React.useState<Category | null>(
    null
  );
  const [selectedLesson, setSelectedLesson] = React.useState<
    (typeof events)[number] | null
  >(null);
  const [dismissed, setDismissed] = React.useState<Set<string>>(
    () => new Set()
  );
  const completeTask = React.useCallback(
    (id: string) => {
      const task = tasks.find((item) => item.id === id);
      if (!task) return;
      void plannerTasks.setCompleted.mutateAsync({ id, completed: !task.done });
    },
    [plannerTasks.setCompleted, tasks]
  );
  const updateTask = React.useCallback(
    (nextTask: Task) => {
      const categoryId = categoryIds.get(nextTask.category);
      if (!categoryId) return;
      void plannerTasks.update.mutateAsync({
        id: nextTask.id,
        title: nextTask.title,
        description: nextTask.note,
        categoryId,
        dueDate: toDateInputValue(nextTask.date) || null,
        dueTime: nextTask.time ?? null,
        recurrence: labelToRecurrence(nextTask.repeat),
      });
    },
    [categoryIds, plannerTasks.update]
  );
  const addTask = React.useCallback(
    (draft: Pick<Task, "title" | "category" | "date" | "time" | "repeat">) => {
      const categoryId = categoryIds.get(draft.category);
      if (!categoryId) return;
      void plannerTasks.create
        .mutateAsync({
          title: draft.title,
          categoryId,
          dueDate: draft.date || null,
          dueTime: draft.time || null,
          recurrence: labelToRecurrence(draft.repeat),
        })
        .then(() => setNewTaskCategory(null));
    },
    [categoryIds, plannerTasks.create]
  );
  const navigation: Array<{
    id: Screen;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: "planner", label: "Планнер", icon: <Sparkles size={17} /> },
    { id: "calendar", label: "Календарь", icon: <CalendarDays size={17} /> },
    { id: "inbox", label: "Входящие", icon: <Inbox size={17} /> },
    { id: "students", label: "Ученики", icon: <Users size={17} /> },
  ];
  return (
    <div className="planner-shell">
      <aside className="planner-sidebar">
        <div className="planner-mark">n</div>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={screen === item.id ? "active" : ""}
              onClick={() => setScreen(item.id)}
              title={item.label}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button className="sidebar-bell" aria-label="Уведомления">
          <Bell size={17} />
        </button>
      </aside>
      <div className="planner-content">
        <header className="planner-header">
          <div>
            <span className="planner-eyebrow">ЛИЧНЫЙ ПЛАННЕР</span>
            <strong>{headerName}</strong>
          </div>
          <div className="header-date">
            <span>Среда</span>
            <b>23 сентября</b>
            <button aria-label="Меню">
              <MoreHorizontal size={19} />
            </button>
          </div>
        </header>
        <main>
          {screen === "planner" ? (
            <PlannerScreen
              tasks={tasks}
              onComplete={completeTask}
              onOpen={setSelectedTask}
              onAdd={setNewTaskCategory}
              onNavigate={setScreen}
            />
          ) : null}
          {screen === "calendar" ? (
            <CalendarScreen onLesson={setSelectedLesson} />
          ) : null}
          {screen === "inbox" ? (
            <InboxScreen
              dismissed={dismissed}
              onDismiss={(title) =>
                setDismissed((current) => new Set(current).add(title))
              }
              onCreate={(title) => {
                setNewTaskCategory("Китай");
                setDismissed((current) => new Set(current).add(title));
              }}
            />
          ) : null}
          {screen === "students" ? (
            <PlannerStudentsScreen />
          ) : null}
        </main>
      </div>
      {selectedTask ? (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onComplete={completeTask}
          onUpdate={updateTask}
        />
      ) : null}
      {newTaskCategory ? (
        <CreateTaskModal
          category={newTaskCategory}
          onClose={() => setNewTaskCategory(null)}
          onCreate={addTask}
        />
      ) : null}
      {selectedLesson ? (
        <LessonModal
          lesson={selectedLesson}
          onClose={() => setSelectedLesson(null)}
        />
      ) : null}
    </div>
  );
}

function PlannerScreen({
  tasks,
  onComplete,
  onOpen,
  onAdd,
  onNavigate,
}: {
  tasks: Task[];
  onComplete: (id: string) => void;
  onOpen: (task: Task) => void;
  onAdd: (category: Category) => void;
  onNavigate: (screen: Screen) => void;
}) {
  const [currentTime, setCurrentTime] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const minutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const isEveningReview = minutes >= 17 * 60 + 50;
  const hasActiveTasks = tasks.some((task) => !task.done);

  return (
    <>
      <section className="planner-intro">
        <div>
          <p>СРЕДА, 23 СЕНТЯБРЯ</p>
          <h1>Сегодня.</h1>
        </div>
        <button className="new-task-button" onClick={() => onAdd("Личное")}>
          <Plus size={16} /> Новая задача
        </button>
      </section>
      <HomeCalendar onOpen={() => onNavigate("calendar")} />
      {!isEveningReview ? (
        <div className="planner-dashboard-review">
          <MorningReviewScreen
            tasks={tasks}
            onOpen={onOpen}
            onNavigate={onNavigate}
          />
        </div>
      ) : null}
      <section className="category-section">
        <div className="section-title">
          <div>
            <span>ЗАДАЧИ ПО НАПРАВЛЕНИЯМ</span>
            <h2>В работе</h2>
          </div>
          <p>Нажмите на задачу, чтобы открыть детали</p>
        </div>
        {hasActiveTasks ? (
          <div className="category-scroll">
            {categories.map((category) => (
              <CategoryColumn
                key={category}
                category={category}
                tasks={tasks.filter((task) => task.category === category)}
                onComplete={onComplete}
                onOpen={onOpen}
                onAdd={onAdd}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="На сегодня всё сделано."
            text="Новые задачи появятся здесь, когда вы их добавите или получите из входящих."
            action="Создать задачу"
            onAction={() => onAdd("Личное")}
          />
        )}
      </section>
      {isEveningReview ? (
        <div className="planner-dashboard-review planner-evening-review">
          <EveningReviewScreen
            tasks={tasks}
            onComplete={onComplete}
            onOpen={onOpen}
          />
        </div>
      ) : null}
    </>
  );
}

function HomeCalendar({ onOpen }: { onOpen: () => void }) {
  const days = ["Пн 21", "Вт 22", "Ср 23", "Чт 24", "Пт 25", "Сб 26", "Вс 27"];
  return (
    <section className="home-calendar" aria-label="Календарь недели">
      <header>
        <span>НЕДЕЛЯ 21—27 СЕНТЯБРЯ</span>
        <button onClick={onOpen}>
          Развернуть <ChevronRight size={14} />
        </button>
      </header>
      <div className="home-calendar-grid">
        <div className="home-hours">
          {["09:00", "11:00", "13:00", "15:00"].map((time) => (
            <span key={time}>{time}</span>
          ))}
        </div>
        {days.map((day, index) => (
          <div
            className={`home-day ${index === 2 ? "is-today" : ""}`}
            key={day}
          >
            <span>{day}</span>
            {index === 1 ? (
              <i className="home-event lesson" style={{ top: "28%" }}>
                11:00 · Урок с Машей
              </i>
            ) : null}
            {index === 2 ? (
              <i className="home-event task" style={{ top: "48%" }}>
                14:30 · Заявление
              </i>
            ) : null}
            {index === 3 ? (
              <i className="home-event meeting" style={{ top: "33%" }}>
                12:00 · Созвон
              </i>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
function CategoryColumn({
  category,
  tasks,
  onComplete,
  onOpen,
  onAdd,
}: {
  category: Category;
  tasks: Task[];
  onComplete: (id: string) => void;
  onOpen: (task: Task) => void;
  onAdd: (category: Category) => void;
}) {
  const activeTasks = tasks.filter((task) => !task.done);
  return (
    <article className="category-column">
      <header>
        <span
          className={`category-icon category-icon-${category.toLowerCase()}`}
        >
          {categoryIcons[category]}
        </span>
        <h3>{category}</h3>
        <small>{activeTasks.length}</small>
      </header>
      <div className="task-stack">
        {activeTasks.length ? (
          activeTasks.map((task) => (
            <div
              className={`task-card ${task.done ? "is-done" : ""}`}
              key={task.id}
            >
              <button
                className="complete-button"
                aria-label="Завершить"
                onClick={() => onComplete(task.id)}
              >
                {task.done ? <Check size={13} /> : null}
              </button>
              <button className="task-open" onClick={() => onOpen(task)}>
                <span>{task.title}</span>
                <small className={task.due}>
                  {task.done ? "Завершено" : task.date}
                </small>
              </button>
            </div>
          ))
        ) : (
          <div className="category-empty">
            <span>Пока пусто</span>
            <small>Новые задачи появятся здесь.</small>
          </div>
        )}
      </div>
      <button className="column-add" onClick={() => onAdd(category)}>
        <Plus size={14} /> Добавить
      </button>
    </article>
  );
}
function CalendarScreen({
  onLesson,
}: {
  onLesson: (event: PlannerEvent) => void;
}) {
  const [calendarEvents, setCalendarEvents] = React.useState(events);
  const [dragged, setDragged] = React.useState<string | null>(null);
  const [dragPreview, setDragPreview] = React.useState<PlannerEvent | null>(
    null
  );
  const [editing, setEditing] = React.useState<PlannerEvent | null>(null);
  const days = ["Пн, 21", "Вт, 22", "Ср, 23", "Чт, 24", "Пт, 25"];
  const getPlacement = (
    event: React.DragEvent<HTMLDivElement>,
    day: number,
    source: PlannerEvent
  ): PlannerEvent => {
    const rect = event.currentTarget.getBoundingClientRect();
    const headerHeight = 44;
    const availableHeight = rect.height - headerHeight;
    const offset = Math.min(
      availableHeight,
      Math.max(0, event.clientY - rect.top - headerHeight)
    );
    const halfHourSlot = Math.round((offset / availableHeight) * 18);
    const safeSlot = Math.min(17, Math.max(0, halfHourSlot));
    const hour = 9 + Math.floor(safeSlot / 2);
    const minutes = safeSlot % 2 === 0 ? "00" : "30";

    return {
      ...source,
      day,
      time: `${String(hour).padStart(2, "0")}:${minutes}`,
      top: 10 + (safeSlot / 17) * 79,
    };
  };
  const save = (event: PlannerEvent) =>
    setCalendarEvents((current) =>
      current.some((item) => item.id === event.id)
        ? current.map((item) => (item.id === event.id ? event : item))
        : [...current, event]
    );
  return (
    <section className="calendar-screen">
      <div className="screen-heading">
        <div>
          <span>КАЛЕНДАРЬ</span>
          <h1>Неделя</h1>
        </div>
        <div className="calendar-controls">
          <button>
            <ChevronLeft size={16} />
          </button>
          <b>21—25 сентября</b>
          <button>
            <ChevronRight size={16} />
          </button>
          <button
            className="calendar-create"
            onClick={() =>
              setEditing({
                id: `event-${Date.now()}`,
                day: 2,
                top: 35,
                title: "",
                time: "10:00",
                kind: "event",
              })
            }
          >
            <Plus size={15} /> Событие
          </button>
        </div>
      </div>
      <p className="calendar-hint">
        Перетаскивайте события по дням и времени. Во время переноса карточка
        показывает новое место полупрозрачно.
      </p>
      <div className="calendar-board">
        <div className="time-scale">
          {["09:00", "11:00", "13:00", "15:00", "17:00"].map((time) => (
            <span key={time}>{time}</span>
          ))}
        </div>
        {days.map((day, index) => (
          <div
            className={`calendar-day ${index === 2 ? "is-current" : ""}`}
            key={day}
            onDragOver={(event) => {
              event.preventDefault();
              const source = calendarEvents.find((item) => item.id === dragged);
              if (source) setDragPreview(getPlacement(event, index, source));
            }}
            onDrop={(event) => {
              event.preventDefault();
              const source = calendarEvents.find((item) => item.id === dragged);
              const next = source ? getPlacement(event, index, source) : null;
              if (next)
                setCalendarEvents((current) =>
                  current.map((item) => (item.id === next.id ? next : item))
                );
              setDragged(null);
              setDragPreview(null);
            }}
          >
            <header>{day}</header>
            {dragPreview && dragPreview.day === index ? (
              <div
                className={`calendar-event drag-preview ${dragPreview.kind}`}
                style={{ top: `${dragPreview.top}%` }}
              >
                <small>{dragPreview.time}</small>
                {dragPreview.title}
              </div>
            ) : null}
            {calendarEvents
              .filter((event) => event.day === index)
              .map((event) => (
                <button
                  draggable
                  key={event.id}
                  onDragStart={() => {
                    setDragged(event.id);
                    setDragPreview(event);
                  }}
                  onDragEnd={() => {
                    setDragged(null);
                    setDragPreview(null);
                  }}
                  onClick={() =>
                    event.kind === "lesson"
                      ? onLesson(event)
                      : setEditing(event)
                  }
                  style={{ top: `${event.top}%` }}
                  className={`calendar-event ${event.kind} ${
                    dragged === event.id ? "is-dragging" : ""
                  }`}
                >
                  <small>{event.time}</small>
                  {event.title}
                </button>
              ))}
          </div>
        ))}
        {!calendarEvents.length ? (
          <div className="calendar-empty-state">
            <CalendarDays size={19} />
            <b>Свободная неделя</b>
            <span>Добавьте встречу, урок или задачу со временем.</span>
            <button
              onClick={() =>
                setEditing({
                  id: `event-${Date.now()}`,
                  day: 2,
                  top: 35,
                  title: "",
                  time: "10:00",
                  kind: "event",
                })
              }
            >
              <Plus size={14} /> Добавить событие
            </button>
          </div>
        ) : null}
      </div>
      {editing ? (
        <CalendarEventModal
          event={editing}
          onClose={() => setEditing(null)}
          onSave={(event) => {
            save(event);
            setEditing(null);
          }}
          onDelete={(id) => {
            setCalendarEvents((current) =>
              current.filter((event) => event.id !== id)
            );
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}
function CalendarEventModal({
  event,
  onClose,
  onSave,
  onDelete,
}: {
  event: PlannerEvent;
  onClose: () => void;
  onSave: (event: PlannerEvent) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = React.useState(event);
  return (
    <Modal onClose={onClose}>
      <div className="modal-top">
        <span>СОБЫТИЕ В КАЛЕНДАРЕ</span>
        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <label>
        Название
        <input
          autoFocus
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Например, встреча"
        />
      </label>
      <div className="modal-two-columns">
        <label>
          День
          <select
            value={draft.day}
            onChange={(e) =>
              setDraft({ ...draft, day: Number(e.target.value) })
            }
          >
            {["Пн, 21", "Вт, 22", "Ср, 23", "Чт, 24", "Пт, 25"].map(
              (day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              )
            )}
          </select>
        </label>
        <label>
          Время
          <select
            value={draft.time}
            onChange={(e) => setDraft({ ...draft, time: e.target.value })}
          >
            {timeOptions.slice(1).map((time) => (
              <option key={time}>{time}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Тип
        <select
          value={draft.kind}
          onChange={(e) =>
            setDraft({ ...draft, kind: e.target.value as PlannerEvent["kind"] })
          }
        >
          <option value="event">Встреча</option>
          <option value="task">Задача</option>
          <option value="lesson">Урок</option>
        </select>
      </label>
      <div className="modal-footer">
        <button className="delete-button" onClick={() => onDelete(draft.id)}>
          <Trash2 size={15} /> Удалить
        </button>
        <button
          className="complete-modal"
          disabled={!draft.title.trim()}
          onClick={() => onSave(draft)}
        >
          <Check size={16} /> Сохранить
        </button>
      </div>
    </Modal>
  );
}
function InboxScreen({
  dismissed,
  onDismiss,
  onCreate,
}: {
  dismissed: Set<string>;
  onDismiss: (title: string) => void;
  onCreate: (title: string) => void;
}) {
  const visible = inboxItems.filter((item) => !dismissed.has(item.title));
  return (
    <section className="inbox-screen">
      <div className="screen-heading">
        <div>
          <span>УТРЕННИЙ РАЗБОР · 10:15</span>
          <h1>Входящие</h1>
        </div>
        <p>Здесь только то, что может стать задачей.</p>
      </div>
      <div className="inbox-list">
        {visible.length ? (
          visible.map((item) => (
            <article key={item.title} className="inbox-card">
              <div className={`source-mark ${item.type}`}>
                {item.type === "telegram" ? (
                  <Send size={16} />
                ) : (
                  <FileText size={16} />
                )}
              </div>
              <div className="inbox-copy">
                <span>{item.source}</span>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
              </div>
              <div className="inbox-actions">
                <button
                  className="create-from-inbox"
                  onClick={() => onCreate(item.title)}
                >
                  <Plus size={15} /> Создать задачу
                </button>
                <button
                  className="dismiss-inbox"
                  onClick={() => onDismiss(item.title)}
                >
                  Не создавать
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-inbox">
            <Check size={22} /> Входящие разобраны
          </div>
        )}
      </div>
    </section>
  );
}

function MorningReviewScreen({
  tasks,
  onOpen,
  onNavigate,
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onNavigate: (screen: Screen) => void;
}) {
  const overdue = tasks.filter((task) => task.due === "overdue" && !task.done);
  const today = tasks.filter((task) => task.due === "today" && !task.done);

  return (
    <section className="daily-review morning-review">
      <div className="review-heading">
        <div>
          <span>ЕЖЕДНЕВНО · 10:15</span>
          <h1>Утренний разбор.</h1>
        </div>
        <p>Коротко свериться с днём, не превращая планнер в ещё один список.</p>
      </div>
      <div className="morning-grid">
        <ReviewTaskPanel
          tone="overdue"
          label="ПРОСРОЧЕНО"
          title="Требуют решения"
          tasks={overdue}
          onOpen={onOpen}
        />
        <ReviewTaskPanel
          tone="today"
          label="СЕГОДНЯ"
          title="До конца дня"
          tasks={today}
          onOpen={onOpen}
        />
        <section className="review-panel mail-panel">
          <span>ПОЧТА · 5 СВЕЖИХ</span>
          <h2>Посмотреть потом</h2>
          <div className="review-mail-list">
            {inboxItems.slice(1).map((item) => (
              <button key={item.title} onClick={() => onNavigate("inbox")}>
                <FileText size={15} />
                <span>{item.title}</span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          <button className="quiet-link" onClick={() => onNavigate("inbox")}>
            Открыть входящие <ChevronRight size={14} />
          </button>
        </section>
      </div>
    </section>
  );
}

function EveningReviewScreen({
  tasks,
  onComplete,
  onOpen,
}: {
  tasks: Task[];
  onComplete: (id: string) => void;
  onOpen: (task: Task) => void;
}) {
  const unfinished = tasks.filter((task) => task.due === "today" && !task.done);
  const completedToday = tasks.filter(
    (task) => task.due === "today" && task.done
  );

  return (
    <section className="daily-review evening-review">
      <div className="review-heading">
        <div>
          <span>ЕЖЕДНЕВНО · 17:50</span>
          <h1>Закрыть день.</h1>
        </div>
        <p>Не переносим задачи автоматически — решение остаётся за вами.</p>
      </div>
      <div className="evening-layout">
        <section className="review-panel evening-list">
          <span>ДЕДЛАЙН СЕГОДНЯ · {unfinished.length}</span>
          <h2>Что осталось</h2>
          {unfinished.length ? (
            <div className="evening-task-list">
              {unfinished.map((task) => (
                <article key={task.id}>
                  <div>
                    <b>{task.title}</b>
                    <span>{task.category}</span>
                  </div>
                  <div className="evening-actions">
                    <button onClick={() => onComplete(task.id)}>
                      Завершить
                    </button>
                    <button onClick={() => onOpen(task)}>
                      Поменять дедлайн
                    </button>
                    <button className="leave-overdue" type="button">
                      Оставить просроченной
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="review-empty">
              <Check size={18} /> На сегодня всё закрыто.
            </div>
          )}
        </section>
        <aside className="review-finish-card">
          <CircleCheck size={22} />
          <span>СДЕЛАНО СЕГОДНЯ</span>
          <b>{completedToday.length}</b>
          <p>
            Завершённые задачи остаются в истории, но не занимают завтрашний
            план.
          </p>
        </aside>
      </div>
    </section>
  );
}

function ReviewTaskPanel({
  tone,
  label,
  title,
  tasks,
  onOpen,
}: {
  tone: "overdue" | "today";
  label: string;
  title: string;
  tasks: Task[];
  onOpen: (task: Task) => void;
}) {
  return (
    <section className={`review-panel ${tone}`}>
      <span>
        {label} · {tasks.length}
      </span>
      <h2>{title}</h2>
      <div className="review-task-list">
        {tasks.length ? (
          tasks.map((task) => (
            <button key={task.id} onClick={() => onOpen(task)}>
              <b>{task.title}</b>
              <small>{task.category}</small>
              <ChevronRight size={14} />
            </button>
          ))
        ) : (
          <div className="review-empty">
            <Check size={18} />{" "}
            {tone === "overdue"
              ? "Ничего не просрочено."
              : "На сегодня пока нет задач."}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyState({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <section className="empty-state">
      <CircleCheck size={22} />
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <button onClick={onAction}>
        <Plus size={15} /> {action}
      </button>
    </section>
  );
}

const timeOptions = [
  "",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];
function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}
function getDueTone(value: string | null): Task["due"] {
  if (!value) return "future";
  const today = localDateString();
  if (value < today) return "overdue";
  if (value === today) return "today";
  return "future";
}
function formatDueDate(value: string | null) {
  if (!value) return "Без срока";
  const today = localDateString();
  if (value === today) return "Сегодня";
  const yesterday = localDateString(new Date(Date.now() - 86_400_000));
  if (value === yesterday) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(`${value}T00:00:00`));
}
function recurrenceToLabel(value: PlannerTaskRow["recurrence"]): Task["repeat"] {
  if (value === "weekly") return "Каждую неделю";
  if (value === "monthly") return "Каждый месяц";
  return "Нет";
}
function labelToRecurrence(value: Task["repeat"]): PlannerTaskRow["recurrence"] {
  if (value === "Каждую неделю") return "weekly";
  if (value === "Каждый месяц") return "monthly";
  return "none";
}
function toDateInputValue(value: string) {
  const days: Record<string, string> = {
    Вчера: "2026-09-22",
    Сегодня: "2026-09-23",
    "22 сентября": "2026-09-22",
    "27 сентября": "2026-09-27",
    "29 сентября": "2026-09-29",
  };
  return days[value] ?? (value.match(/^\d{4}-\d{2}-\d{2}$/) ? value : "");
}
function TaskModal({
  task,
  onClose,
  onComplete,
  onUpdate,
}: {
  task: Task;
  onClose: () => void;
  onComplete: (id: string) => void;
  onUpdate: (task: Task) => void;
}) {
  const [draft, setDraft] = React.useState(task);
  const change = (field: keyof Task, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  return (
    <Modal onClose={onClose}>
      <div className="modal-top">
        <span>ЗАДАЧА</span>
        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <label>
        Название
        <input
          value={draft.title}
          onChange={(event) => change("title", event.target.value)}
        />
      </label>
      <div className="modal-two-columns">
        <label>
          Направление
          <select
            value={draft.category}
            onChange={(event) => change("category", event.target.value)}
          >
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Дата дедлайна
          <input
            type="date"
            value={toDateInputValue(draft.date)}
            onChange={(event) => change("date", event.target.value)}
          />
        </label>
      </div>
      <div className="modal-two-columns">
        <label>
          Время
          <select
            value={draft.time ?? ""}
            onChange={(event) => change("time", event.target.value)}
          >
            <option value="">Не задано</option>
            {timeOptions.slice(1).map((time) => (
              <option key={time}>{time}</option>
            ))}
          </select>
        </label>
        <label>
          Повтор
          <select
            value={draft.repeat ?? "Нет"}
            onChange={(event) => change("repeat", event.target.value)}
          >
            <option>Нет</option>
            <option>Каждую неделю</option>
            <option>Каждый месяц</option>
          </select>
        </label>
      </div>
      <label>
        Описание
        <textarea
          value={draft.note ?? ""}
          onChange={(event) => change("note", event.target.value)}
          placeholder="Добавьте детали задачи"
        />
      </label>
      <button className="attachment-button">
        <Paperclip size={15} /> Прикрепить файл, изображение или ссылку
      </button>
      <div className="modal-footer">
        <button className="delete-button">
          <Trash2 size={15} /> Удалить
        </button>
        <button
          className="save-task"
          onClick={() => {
            onUpdate(draft);
            onClose();
          }}
        >
          Сохранить
        </button>
        <button
          className="complete-modal"
          onClick={() => {
            onUpdate(draft);
            onComplete(task.id);
            onClose();
          }}
        >
          <CircleCheck size={16} /> {task.done ? "Вернуть" : "Завершить"}
        </button>
      </div>
    </Modal>
  );
}
function CreateTaskModal({
  category,
  onClose,
  onCreate,
}: {
  category: Category;
  onClose: () => void;
  onCreate: (
    task: Pick<Task, "title" | "category" | "date" | "time" | "repeat">
  ) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [target, setTarget] = React.useState(category);
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [repeat, setRepeat] = React.useState<Task["repeat"]>("Нет");
  return (
    <Modal onClose={onClose}>
      <div className="modal-top">
        <span>НОВАЯ ЗАДАЧА</span>
        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <label>
        Название
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Что нужно сделать?"
        />
      </label>
      <div className="modal-two-columns">
        <label>
          Направление
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value as Category)}
          >
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Дата дедлайна
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </div>
      <div className="modal-two-columns">
        <label>
          Время
          <select
            value={time}
            onChange={(event) => setTime(event.target.value)}
          >
            <option value="">Не задано</option>
            {timeOptions.slice(1).map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Повтор
          <select
            value={repeat}
            onChange={(event) =>
              setRepeat(event.target.value as Task["repeat"])
            }
          >
            <option>Нет</option>
            <option>Каждую неделю</option>
            <option>Каждый месяц</option>
          </select>
        </label>
      </div>
      <button
        disabled={!title.trim()}
        className="complete-modal"
        onClick={() =>
          onCreate({
            title: title.trim(),
            category: target,
            date,
            time,
            repeat,
          })
        }
      >
        <Plus size={16} /> Создать
      </button>
    </Modal>
  );
}
function LessonModal({
  lesson,
  onClose,
}: {
  lesson: (typeof events)[number];
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className="modal-top">
        <span>УРОК · {lesson.time}</span>
        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <h2>{lesson.title.replace("Занятие · ", "")}</h2>
      <label>
        Тема урока
        <input placeholder="Что проходили?" />
      </label>
      <label>
        Домашнее задание
        <textarea placeholder="Свободный текст для ученика" />
      </label>
      <div className="modal-footer">
        <button className="delete-button">
          <Trash2 size={15} /> Удалить
        </button>
        <button className="complete-modal" onClick={onClose}>
          <Check size={16} /> Сохранить
        </button>
      </div>
    </Modal>
  );
}
function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="planner-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}
