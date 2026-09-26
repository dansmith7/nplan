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
  LibraryBig,
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
import { PlannerCollectionsScreen } from "./planner-collections-screen";
import { usePlannerBootstrap } from "@/hooks/use-planner-bootstrap";
import { useDesktopNotifications } from "@/hooks/use-desktop-notifications";
import {
  getAutoLaunch,
  getNotificationPermission,
  isDesktop,
  requestNotificationPermission,
  setAutoLaunch,
  showNotification,
  type NotificationPermissionState,
} from "@/lib/desktop";
import {
  type PlannerTaskRow,
  usePlannerTasks,
} from "@/hooks/use-planner-tasks";
import {
  type CalendarEventInput,
  type CalendarEventKind,
  type PlannerCalendarEventRow,
  usePlannerCalendarEvents,
} from "@/hooks/use-planner-calendar-events";
import { usePlannerStudents } from "@/hooks/use-planner-students";
import {
  type PlannerInboxRow,
  usePlannerInbox,
} from "@/hooks/use-planner-inbox";
import {
  type PlannerLessonRow,
  useLessonConfirmationActions,
  usePendingLessonConfirmations,
} from "@/hooks/use-planner-lessons";

type Screen = "planner" | "calendar" | "inbox" | "students" | "collections";
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
  dueDate: string | null;
  time?: string;
  repeat?: "Нет" | "Каждую неделю" | "Каждый месяц";
  done?: boolean;
  note?: string;
  completedAt?: string;
};
type TaskDraft = Pick<
  Task,
  "title" | "category" | "dueDate" | "time" | "repeat"
>;
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

function formatCurrentDate(date: Date, timezone?: string) {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  };
  const parts = new Intl.DateTimeFormat("ru-RU", options).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return { weekday, date: `${day} ${month}` };
}

function formatClockTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(date);
}
type PlannerEvent = {
  id: string;
  day: number;
  top: number;
  title: string;
  time: string;
  kind: CalendarEventKind;
  durationMinutes: number;
  studentId: string | null;
  taskId: string | null;
  description: string | null;
  recurrence: "none" | "weekly" | "monthly";
  lessonNotes: {
    topic: string | null;
    homework: string | null;
    status: "scheduled" | "held" | "cancelled";
  } | null;
  isNew?: boolean;
};

const calendarDays = 7;
const lessonDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function startOfPlannerWeek(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function addCalendarDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}

function localDateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function weekDayDates(weekStart: Date) {
  return Array.from({ length: calendarDays }, (_, index) =>
    addCalendarDays(weekStart, index)
  );
}

function eventTop(time: string) {
  const [hours = 9, minutes = 0] = time.split(":").map(Number);
  const minuteOfDay = hours * 60 + minutes;
  const clamped = Math.min(18 * 60, Math.max(9 * 60, minuteOfDay));
  return 10 + ((clamped - 9 * 60) / (9 * 60)) * 79;
}

function toPlannerEvent(
  event: PlannerCalendarEventRow,
  weekStart: Date
): PlannerEvent | null {
  const startsAt = new Date(event.starts_at);
  const day = weekDayDates(weekStart).findIndex(
    (date) => localDateKey(date) === localDateKey(startsAt)
  );
  if (day < 0) return null;
  const time = `${String(startsAt.getHours()).padStart(2, "0")}:${String(
    startsAt.getMinutes()
  ).padStart(2, "0")}`;
  return {
    id: event.id,
    day,
    top: eventTop(time),
    title: event.title,
    time,
    kind: event.kind,
    durationMinutes: Math.max(
      30,
      Math.round(
        (new Date(event.ends_at).getTime() - startsAt.getTime()) / 60_000
      )
    ),
    studentId: event.student_id,
    taskId: event.task_id,
    description: event.description,
    recurrence: event.recurrence,
    lessonNotes: event.notes,
  };
}

function toCalendarEventInput(
  event: PlannerEvent,
  weekStart: Date
): CalendarEventInput {
  const date = addCalendarDays(weekStart, event.day);
  const [hours = 9, minutes = 0] = event.time.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  const endsAt = new Date(date.getTime() + event.durationMinutes * 60_000);
  return {
    kind: event.kind,
    title: event.title,
    startsAt: date.toISOString(),
    endsAt: endsAt.toISOString(),
    studentId: event.kind === "lesson" ? event.studentId : null,
    taskId: event.kind === "task" ? event.taskId : null,
    description: event.description,
    recurrence: event.recurrence,
  };
}
export function StudioDashboard() {
  const plannerBootstrap = usePlannerBootstrap();
  useDesktopNotifications(plannerBootstrap.data?.profile);
  const plannerTasks = usePlannerTasks();
  const plannerInbox = usePlannerInbox();
  const pendingLessons = usePendingLessonConfirmations();
  const lessonConfirmation = useLessonConfirmationActions();
  const [calendarWeekStart, setCalendarWeekStart] = React.useState(() =>
    startOfPlannerWeek(new Date())
  );
  const calendarRange = React.useMemo(
    () => ({
      from: calendarWeekStart.toISOString(),
      to: addCalendarDays(calendarWeekStart, calendarDays).toISOString(),
    }),
    [calendarWeekStart]
  );
  const plannerCalendar = usePlannerCalendarEvents(calendarRange);
  const calendarEvents = React.useMemo(
    () =>
      (plannerCalendar.data ?? []).flatMap((event) => {
        const mapped = toPlannerEvent(event, calendarWeekStart);
        return mapped ? [mapped] : [];
      }),
    [calendarWeekStart, plannerCalendar.data]
  );
  const [headerNow, setHeaderNow] = React.useState(() => new Date());
  const [activeClock, setActiveClock] = React.useState<"moscow" | "guangzhou">(
    "moscow"
  );
  React.useEffect(() => {
    const timer = window.setInterval(() => setHeaderNow(new Date()), 30_000);
    const root = document.documentElement;
    const body = document.body;
    const isTauri = "__TAURI_INTERNALS__" in window;
    root.classList.add("studio-shell-active");
    body.classList.add("studio-shell-active");
    root.classList.toggle("tauri-window", isTauri);
    body.classList.toggle("tauri-window", isTauri);
    return () => {
      window.clearInterval(timer);
      root.classList.remove("studio-shell-active", "tauri-window");
      body.classList.remove("studio-shell-active", "tauri-window");
    };
  }, []);
  const currentDate = formatCurrentDate(
    headerNow,
    plannerBootstrap.data?.profile.timezone
  );
  const moscowTime = formatClockTime(headerNow, "Europe/Moscow");
  const guangzhouTime = formatClockTime(headerNow, "Asia/Shanghai");
  const displayName = plannerBootstrap.data?.profile.display_name;
  const headerName =
    displayName && !displayName.includes("@")
      ? displayName.split(" ")[0]
      : "Собранно.";
  const [screen, setScreen] = React.useState<Screen>("planner");
  React.useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [screen]);
  const tasks = React.useMemo<Task[]>(() => {
    if (!plannerTasks.data) return [];
    return plannerTasks.data.flatMap((task) => {
      const category = task.category?.name as Category | undefined;
      if (!category || !categories.includes(category)) return [];
      return [
        {
          id: task.id,
          title: task.title,
          category,
          due: getDueTone(task.due_date),
          date: formatDueDate(task.due_date),
          dueDate: task.due_date,
          time: task.due_time ?? undefined,
          repeat: recurrenceToLabel(task.recurrence),
          done: task.status === "completed",
          note: task.description ?? undefined,
          completedAt: task.completed_at ?? undefined,
        },
      ];
    });
  }, [plannerTasks.data]);
  const categoryIds = React.useMemo(
    () =>
      new Map(
        plannerBootstrap.data?.categories.map((item) => [item.name, item.id])
      ),
    [plannerBootstrap.data?.categories]
  );
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [newTaskCategory, setNewTaskCategory] = React.useState<Category | null>(
    null
  );
  const [inboxTaskDraft, setInboxTaskDraft] = React.useState<{
    id: string;
    title: string;
  } | null>(null);
  const [taskCreationError, setTaskCreationError] = React.useState<
    string | null
  >(null);
  const [selectedLesson, setSelectedLesson] =
    React.useState<PlannerEvent | null>(null);
  const [notificationSettingsOpen, setNotificationSettingsOpen] =
    React.useState(false);
  const completeTask = React.useCallback(
    async (id: string) => {
      const task = tasks.find((item) => item.id === id);
      if (!task) return;
      await plannerTasks.setCompleted.mutateAsync({
        id,
        completed: !task.done,
      });
    },
    [plannerTasks.setCompleted, tasks]
  );
  const updateTask = React.useCallback(
    async (nextTask: Task) => {
      const categoryId = categoryIds.get(nextTask.category);
      if (!categoryId) throw new Error("Категория задачи не найдена");
      await plannerTasks.update.mutateAsync({
        id: nextTask.id,
        title: nextTask.title,
        description: nextTask.note,
        categoryId,
        dueDate: nextTask.dueDate,
        dueTime: nextTask.time ?? null,
        recurrence: labelToRecurrence(nextTask.repeat),
      });
    },
    [categoryIds, plannerTasks.update]
  );
  const addTask = React.useCallback(
    (draft: TaskDraft) => {
      const categoryId = categoryIds.get(draft.category);
      if (!categoryId) return;
      setTaskCreationError(null);
      const input = {
        title: draft.title,
        categoryId,
        dueDate: draft.dueDate || null,
        dueTime: draft.time || null,
        recurrence: labelToRecurrence(draft.repeat),
      };
      const mutation = inboxTaskDraft
        ? plannerInbox.promote.mutateAsync({ id: inboxTaskDraft.id, ...input })
        : plannerTasks.create.mutateAsync(input);
      void mutation
        .then(() => {
          setNewTaskCategory(null);
          setInboxTaskDraft(null);
        })
        .catch(() => {
          setTaskCreationError(
            "Не удалось создать задачу. Попробуйте ещё раз."
          );
        });
    },
    [categoryIds, inboxTaskDraft, plannerInbox.promote, plannerTasks.create]
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
    {
      id: "collections",
      label: "Коллекции",
      icon: <LibraryBig size={17} />,
    },
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
        <button
          className="sidebar-bell"
          aria-label="Настройки уведомлений"
          title="Настройки уведомлений"
          onClick={() => setNotificationSettingsOpen(true)}
        >
          <Bell size={17} />
        </button>
      </aside>
      <div className="planner-content">
        <header className="planner-header" data-tauri-drag-region>
          <div className="header-identity">
            <span className="planner-eyebrow">ЛИЧНЫЙ ПЛАННЕР</span>
            <strong>{headerName}</strong>
          </div>
          <div className="header-clocks" aria-label="Москва и Гуанчжоу">
            <button
              className={`world-clock ${activeClock === "moscow" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveClock("moscow")}
            >
              <span>МОСКВА</span>
              <strong>{moscowTime}</strong>
              <small>UTC+3</small>
            </button>
            <button
              className={`clock-switch ${activeClock === "guangzhou" ? "right" : ""}`}
              type="button"
              role="switch"
              aria-checked={activeClock === "guangzhou"}
              aria-label="Переключить основной часовой пояс"
              onClick={() =>
                setActiveClock((value) =>
                  value === "moscow" ? "guangzhou" : "moscow"
                )
              }
            >
              <span />
            </button>
            <button
              className={`world-clock ${activeClock === "guangzhou" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveClock("guangzhou")}
            >
              <strong>{guangzhouTime}</strong>
              <span>ГУАНЧЖОУ</span>
              <small>UTC+8</small>
            </button>
          </div>
          <div className="header-date">
            <span>{currentDate.weekday}</span>
            <b>{currentDate.date}</b>
            <button aria-label="Меню">
              <MoreHorizontal size={19} />
            </button>
          </div>
        </header>
        <main>
          <div className="planner-screen-stage" key={screen}>
            {screen === "planner" ? (
              <PlannerScreen
                tasks={tasks}
                calendarEvents={calendarEvents}
                calendarWeekStart={calendarWeekStart}
                inboxItems={plannerInbox.data ?? []}
                inboxIsLoading={plannerInbox.isLoading}
                inboxIsError={plannerInbox.isError}
                pendingLessons={pendingLessons.data ?? []}
                onConfirmLesson={(eventId, status) =>
                  lessonConfirmation.setStatus.mutateAsync({ eventId, status })
                }
                onComplete={completeTask}
                onOpen={setSelectedTask}
                onAdd={(category) => {
                  setTaskCreationError(null);
                  setNewTaskCategory(category);
                }}
                onNavigate={setScreen}
              />
            ) : null}
            {screen === "calendar" ? (
              <CalendarScreen
                events={calendarEvents}
                weekStart={calendarWeekStart}
                isLoading={plannerCalendar.isLoading}
                onWeekChange={setCalendarWeekStart}
                onCreate={(event) =>
                  plannerCalendar.create.mutateAsync(
                    toCalendarEventInput(event, calendarWeekStart)
                  )
                }
                onUpdate={(event) =>
                  plannerCalendar.update.mutateAsync({
                    id: event.id,
                    ...toCalendarEventInput(event, calendarWeekStart),
                  })
                }
                onDelete={(id) => plannerCalendar.remove.mutateAsync(id)}
                onLesson={setSelectedLesson}
              />
            ) : null}
            {screen === "inbox" ? (
              <InboxScreen
                items={plannerInbox.data ?? []}
                isLoading={plannerInbox.isLoading}
                onDismiss={(id) => void plannerInbox.dismiss.mutateAsync(id)}
                onCreate={(item) => {
                  setTaskCreationError(null);
                  setInboxTaskDraft({ id: item.id, title: item.title });
                  setNewTaskCategory("Личное");
                }}
              />
            ) : null}
            {screen === "students" ? <PlannerStudentsScreen /> : null}
            {screen === "collections" ? <PlannerCollectionsScreen /> : null}
          </div>
        </main>
      </div>
      {selectedTask ? (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onComplete={completeTask}
          onUpdate={updateTask}
          onDelete={async (id) => {
            await plannerTasks.remove.mutateAsync(id);
          }}
        />
      ) : null}
      {newTaskCategory ? (
        <CreateTaskModal
          category={newTaskCategory}
          initialTitle={inboxTaskDraft?.title}
          error={taskCreationError}
          isCreating={
            plannerTasks.create.isPending || plannerInbox.promote.isPending
          }
          onClose={() => {
            setNewTaskCategory(null);
            setInboxTaskDraft(null);
            setTaskCreationError(null);
          }}
          onCreate={addTask}
        />
      ) : null}
      {selectedLesson ? (
        <LessonModal
          lesson={selectedLesson}
          onClose={() => setSelectedLesson(null)}
          onSave={async (topic, homework) => {
            await lessonConfirmation.saveNotes.mutateAsync({
              eventId: selectedLesson.id,
              topic,
              homework,
            });
            setSelectedLesson(null);
          }}
          onDelete={async () => {
            await lessonConfirmation.remove.mutateAsync(selectedLesson.id);
            setSelectedLesson(null);
          }}
        />
      ) : null}
      {notificationSettingsOpen ? (
        <NotificationSettingsModal
          onClose={() => setNotificationSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}

function PlannerScreen({
  tasks,
  calendarEvents,
  calendarWeekStart,
  inboxItems,
  inboxIsLoading,
  inboxIsError,
  pendingLessons,
  onConfirmLesson,
  onComplete,
  onOpen,
  onAdd,
  onNavigate,
}: {
  tasks: Task[];
  calendarEvents: PlannerEvent[];
  calendarWeekStart: Date;
  inboxItems: PlannerInboxRow[];
  inboxIsLoading: boolean;
  inboxIsError: boolean;
  pendingLessons: PlannerLessonRow[];
  onConfirmLesson: (
    eventId: string,
    status: "held" | "cancelled"
  ) => Promise<unknown>;
  onComplete: (id: string) => void | Promise<void>;
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
  const todayLabel = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(currentTime)
    .toLocaleUpperCase("ru-RU");

  return (
    <>
      <section className="planner-intro">
        <div>
          <p>{todayLabel}</p>
          <h1>Сегодня.</h1>
        </div>
        <button className="new-task-button" onClick={() => onAdd("Личное")}>
          <Plus size={16} /> Новая задача
        </button>
      </section>
      <HomeCalendar
        events={calendarEvents}
        weekStart={calendarWeekStart}
        onOpen={() => onNavigate("calendar")}
      />
      <TaskHorizon
        tasks={tasks}
        inboxItems={inboxItems}
        inboxIsLoading={inboxIsLoading}
        inboxIsError={inboxIsError}
        onOpen={onOpen}
        onOpenInbox={() => onNavigate("inbox")}
      />
      {!isEveningReview ? (
        <div className="planner-dashboard-review">
          <MorningReviewScreen
            inboxItems={inboxItems}
            pendingLessons={pendingLessons}
            onConfirmLesson={onConfirmLesson}
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
                onComplete={(id) => void onComplete(id)}
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
            onComplete={(id) => void onComplete(id)}
            onOpen={onOpen}
          />
        </div>
      ) : null}
    </>
  );
}

function TaskHorizon({
  tasks,
  inboxItems,
  inboxIsLoading,
  inboxIsError,
  onOpen,
  onOpenInbox,
}: {
  tasks: Task[];
  inboxItems: PlannerInboxRow[];
  inboxIsLoading: boolean;
  inboxIsError: boolean;
  onOpen: (task: Task) => void;
  onOpenInbox: () => void;
}) {
  const active = tasks.filter((task) => !task.done);
  const overdue = active.filter((task) => task.due === "overdue");
  const today = active.filter((task) => task.due === "today");
  const future = active.filter((task) => task.due === "future");

  return (
    <section className="task-horizon" aria-label="Задачи по срокам">
      <header>
        <span>ФОКУС ДНЯ</span>
        <h2>Что требует внимания.</h2>
      </header>
      <div className="task-horizon-grid">
        <ReviewTaskPanel
          tone="overdue"
          label="ПРОСРОЧЕНО"
          title="Нужно разобрать"
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
        <ReviewTaskPanel
          tone="future"
          label="ПРЕДСТОИТ"
          title="Дальше по плану"
          tasks={future}
          onOpen={onOpen}
        />
        <InboxReviewPanel
          items={inboxItems}
          isLoading={inboxIsLoading}
          isError={inboxIsError}
          onOpen={onOpenInbox}
        />
      </div>
    </section>
  );
}

function InboxReviewPanel({
  items,
  isLoading,
  isError,
  onOpen,
}: {
  items: PlannerInboxRow[];
  isLoading: boolean;
  isError: boolean;
  onOpen: () => void;
}) {
  return (
    <section className="review-panel inbox">
      <span>ВХОДЯЩИЕ · {items.length}</span>
      <h2>Разобрать входящие</h2>
      <div className="review-task-list">
        {isLoading ? (
          <div className="review-panel-state">Загружаю входящие…</div>
        ) : null}
        {isError ? (
          <button onClick={onOpen}>
            <b>Не удалось загрузить</b>
            <small>Открыть раздел и повторить</small>
            <ChevronRight size={14} />
          </button>
        ) : null}
        {!isLoading && !isError && items.length === 0 ? (
          <div className="review-panel-state">
            <b>Входящие разобраны</b>
            <small>Новые задачи из Telegram и почты появятся здесь</small>
          </div>
        ) : null}
        {items.slice(0, 2).map((item) => (
          <button key={item.id} onClick={onOpen}>
            <b>{item.title}</b>
            <small>{item.source === "telegram" ? "Telegram" : "Почта"}</small>
            <ChevronRight size={14} />
          </button>
        ))}
        {!isLoading && !isError && items.length ? (
          <button onClick={onOpen}>
            <b>Открыть все входящие</b>
            <small>Разобрать сейчас</small>
            <ChevronRight size={14} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function HomeCalendar({
  events,
  weekStart,
  onOpen,
}: {
  events: PlannerEvent[];
  weekStart: Date;
  onOpen: () => void;
}) {
  const days = weekDayDates(weekStart);
  const today = localDateKey(new Date());
  const rangeLabel =
    `${days[0]!.getDate()}—${days[6]!.getDate()} ${new Intl.DateTimeFormat(
      "ru-RU",
      { month: "long" }
    ).format(days[6]!)}`.toLocaleUpperCase("ru-RU");
  return (
    <section className="home-calendar" aria-label="Календарь недели">
      <header>
        <span>НЕДЕЛЯ {rangeLabel}</span>
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
            className={`home-day ${localDateKey(day) === today ? "is-today" : ""}`}
            key={localDateKey(day)}
          >
            <span>
              {new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(
                day
              )}{" "}
              {day.getDate()}
            </span>
            {events
              .filter((event) => event.day === index)
              .map((event) => (
                <i
                  className={`home-event ${event.kind}`}
                  style={{ top: `${event.top}%` }}
                  key={event.id}
                >
                  {event.time} · {event.title}
                </i>
              ))}
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
                onClick={() => void onComplete(task.id)}
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
  events,
  weekStart,
  isLoading,
  onWeekChange,
  onCreate,
  onUpdate,
  onDelete,
  onLesson,
}: {
  events: PlannerEvent[];
  weekStart: Date;
  isLoading: boolean;
  onWeekChange: (weekStart: Date) => void;
  onCreate: (event: PlannerEvent) => Promise<unknown>;
  onUpdate: (event: PlannerEvent) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onLesson: (event: PlannerEvent) => void;
}) {
  const [dragged, setDragged] = React.useState<string | null>(null);
  const [dragPreview, setDragPreview] = React.useState<PlannerEvent | null>(
    null
  );
  const dragGesture = React.useRef<{
    pointerId: number;
    eventId: string;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const suppressEventClick = React.useRef(false);
  const [editing, setEditing] = React.useState<PlannerEvent | null>(null);
  // Keep all seven days in the calendar. The API range already includes
  // Saturday and Sunday, but this view used to trim them away here, which
  // also made weekend dates unavailable in the event editor.
  const dates = weekDayDates(weekStart);
  const todayKey = localDateKey(new Date());
  const todayIndex = dates.findIndex((date) => localDateKey(date) === todayKey);
  const days = dates.map(
    (date) =>
      `${new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date)}, ${date.getDate()}`
  );
  const rangeLabel = `${dates[0]!.getDate()}—${dates[6]!.getDate()} ${new Intl.DateTimeFormat(
    "ru-RU",
    { month: "long" }
  ).format(dates[6]!)}`;
  const visibleEvents = events;
  const getPlacement = (
    clientY: number,
    target: HTMLElement,
    day: number,
    source: PlannerEvent
  ): PlannerEvent => {
    const rect = target.getBoundingClientRect();
    const headerHeight = 44;
    const availableHeight = Math.max(1, rect.height - headerHeight);
    const offset = Math.min(
      availableHeight,
      Math.max(0, clientY - rect.top - headerHeight)
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
  const placementAtPointer = (
    clientX: number,
    clientY: number,
    source: PlannerEvent
  ) => {
    const target = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>(".calendar-day[data-day-index]");
    if (!target) return null;
    const day = Number(target.dataset.dayIndex);
    if (!Number.isInteger(day)) return null;
    return getPlacement(clientY, target, day, source);
  };
  const clearDrag = () => {
    dragGesture.current = null;
    setDragged(null);
    setDragPreview(null);
  };
  const createDraft = (): PlannerEvent => ({
    id: `new-${Date.now()}`,
    day: todayIndex >= 0 ? todayIndex : 0,
    top: eventTop("10:00"),
    title: "",
    time: "10:00",
    kind: "meeting",
    durationMinutes: 60,
    studentId: null,
    taskId: null,
    description: null,
    recurrence: "none",
    lessonNotes: null,
    isNew: true,
  });
  return (
    <section className="calendar-screen">
      <div className="screen-heading">
        <div>
          <span>КАЛЕНДАРЬ</span>
          <h1>Неделя</h1>
        </div>
        <div className="calendar-controls">
          <button onClick={() => onWeekChange(addCalendarDays(weekStart, -7))}>
            <ChevronLeft size={16} />
          </button>
          <b>{rangeLabel}</b>
          <button onClick={() => onWeekChange(addCalendarDays(weekStart, 7))}>
            <ChevronRight size={16} />
          </button>
          <button
            className="calendar-create"
            onClick={() => setEditing(createDraft())}
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
            className={`calendar-day ${index === todayIndex ? "is-current" : ""}`}
            key={day}
            data-day-index={index}
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
            {visibleEvents
              .filter((event) => event.day === index)
              .map((event) => (
                <button
                  key={event.id}
                  onPointerDown={(pointerEvent) => {
                    if (pointerEvent.button !== 0) return;
                    dragGesture.current = {
                      pointerId: pointerEvent.pointerId,
                      eventId: event.id,
                      startX: pointerEvent.clientX,
                      startY: pointerEvent.clientY,
                      active: false,
                    };
                    pointerEvent.currentTarget.setPointerCapture(
                      pointerEvent.pointerId
                    );
                  }}
                  onPointerMove={(pointerEvent) => {
                    const gesture = dragGesture.current;
                    if (
                      !gesture ||
                      gesture.pointerId !== pointerEvent.pointerId ||
                      gesture.eventId !== event.id
                    )
                      return;
                    const distance = Math.hypot(
                      pointerEvent.clientX - gesture.startX,
                      pointerEvent.clientY - gesture.startY
                    );
                    if (!gesture.active && distance < 5) return;
                    if (!gesture.active) {
                      gesture.active = true;
                      setDragged(event.id);
                    }
                    pointerEvent.preventDefault();
                    const next = placementAtPointer(
                      pointerEvent.clientX,
                      pointerEvent.clientY,
                      event
                    );
                    if (next) setDragPreview(next);
                  }}
                  onPointerUp={(pointerEvent) => {
                    const gesture = dragGesture.current;
                    if (
                      !gesture ||
                      gesture.pointerId !== pointerEvent.pointerId ||
                      gesture.eventId !== event.id
                    )
                      return;
                    if (gesture.active) {
                      pointerEvent.preventDefault();
                      suppressEventClick.current = true;
                      const next = placementAtPointer(
                        pointerEvent.clientX,
                        pointerEvent.clientY,
                        event
                      );
                      if (next) void onUpdate(next);
                      window.setTimeout(() => {
                        suppressEventClick.current = false;
                      }, 0);
                    }
                    clearDrag();
                  }}
                  onPointerCancel={clearDrag}
                  onClick={(clickEvent) => {
                    if (suppressEventClick.current) {
                      clickEvent.preventDefault();
                      return;
                    }
                    event.kind === "lesson"
                      ? onLesson(event)
                      : setEditing(event);
                  }}
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
        {!isLoading && !visibleEvents.length ? (
          <div className="calendar-empty-state">
            <CalendarDays size={19} />
            <b>Свободная неделя</b>
            <span>Добавьте встречу, урок или задачу со временем.</span>
            <button onClick={() => setEditing(createDraft())}>
              <Plus size={14} /> Добавить событие
            </button>
          </div>
        ) : null}
      </div>
      {editing ? (
        <CalendarEventModal
          event={editing}
          days={days}
          onClose={() => setEditing(null)}
          onSave={async (event) => {
            const mutation = event.isNew ? onCreate(event) : onUpdate(event);
            await mutation;
            setEditing(null);
          }}
          onDelete={async (id) => {
            if (editing.isNew) {
              setEditing(null);
              return;
            }
            await onDelete(id);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}
function CalendarEventModal({
  event,
  days,
  onClose,
  onSave,
  onDelete,
}: {
  event: PlannerEvent;
  days: string[];
  onClose: () => void;
  onSave: (event: PlannerEvent) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState(event);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const students = usePlannerStudents();
  const save = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await onSave(draft);
    } catch {
      setError("Не удалось сохранить событие. Повторите ещё раз.");
      setIsSaving(false);
    }
  };
  const remove = async () => {
    if (!event.isNew && !window.confirm("Удалить это событие?")) return;
    setError(null);
    setIsDeleting(true);
    try {
      await onDelete(draft.id);
    } catch {
      setError("Не удалось удалить событие. Повторите ещё раз.");
      setIsDeleting(false);
    }
  };
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
            {days.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
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
          onChange={(e) => {
            const kind = e.target.value as PlannerEvent["kind"];
            setDraft({
              ...draft,
              kind,
              studentId:
                kind === "lesson"
                  ? (draft.studentId ?? students.data?.[0]?.id ?? null)
                  : null,
            });
          }}
        >
          <option value="meeting">Встреча</option>
          <option value="task">Задача</option>
          <option value="lesson">Урок</option>
        </select>
      </label>
      {draft.kind === "lesson" ? (
        <label>
          Ученик
          <select
            value={draft.studentId ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, studentId: event.target.value || null })
            }
          >
            <option value="">Выберите ученика</option>
            {(students.data ?? []).map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {error ? <p className="modal-error">{error}</p> : null}
      <div className="modal-footer">
        <button
          className="delete-button"
          disabled={isSaving || isDeleting}
          onClick={() => void remove()}
        >
          <Trash2 size={15} /> {isDeleting ? "Удаляю…" : "Удалить"}
        </button>
        <button
          className="complete-modal"
          disabled={
            isSaving ||
            isDeleting ||
            !draft.title.trim() ||
            (draft.kind === "lesson" && !draft.studentId)
          }
          onClick={() => void save()}
        >
          <Check size={16} /> {isSaving ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>
    </Modal>
  );
}
function InboxScreen({
  items,
  isLoading,
  onDismiss,
  onCreate,
}: {
  items: PlannerInboxRow[];
  isLoading: boolean;
  onDismiss: (id: string) => void;
  onCreate: (item: PlannerInboxRow) => void;
}) {
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
        {isLoading ? (
          <div className="empty-inbox">Загружаю входящие…</div>
        ) : items.length ? (
          items.map((item) => {
            const isTelegram = item.source === "telegram";
            const receivedAt = new Intl.DateTimeFormat("ru-RU", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(item.received_at));
            const details = item.transcript || item.raw_text;
            return (
              <article key={item.id} className="inbox-card">
                <div
                  className={`source-mark ${isTelegram ? "telegram" : "mail"}`}
                >
                  {isTelegram ? <Send size={16} /> : <FileText size={16} />}
                </div>
                <div className="inbox-copy">
                  <span>
                    {isTelegram ? "Telegram" : "Яндекс Почта"} · {receivedAt}
                  </span>
                  <h2>{item.title}</h2>
                  <p>{details || "Без дополнительного текста"}</p>
                </div>
                <div className="inbox-actions">
                  <button
                    className="create-from-inbox"
                    onClick={() => onCreate(item)}
                  >
                    <Plus size={15} /> Создать задачу
                  </button>
                  <button
                    className="dismiss-inbox"
                    onClick={() => onDismiss(item.id)}
                  >
                    Не создавать
                  </button>
                </div>
              </article>
            );
          })
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
  inboxItems,
  pendingLessons,
  onConfirmLesson,
  onNavigate,
}: {
  inboxItems: PlannerInboxRow[];
  pendingLessons: PlannerLessonRow[];
  onConfirmLesson: (
    eventId: string,
    status: "held" | "cancelled"
  ) => Promise<unknown>;
  onNavigate: (screen: Screen) => void;
}) {
  const mailItems = inboxItems.filter((item) => item.source === "yandex_mail");

  return (
    <section className="daily-review morning-review">
      <div className="review-heading">
        <div>
          <span>ЕЖЕДНЕВНО · 10:15</span>
          <h1>Утренний разбор.</h1>
        </div>
        <p>Коротко свериться с днём, не превращая планнер в ещё один список.</p>
      </div>
      <div className="morning-grid morning-mail-grid">
        <section className="review-panel mail-panel morning-mail-panel">
          <span>ПОЧТА · {mailItems.length} СВЕЖИХ</span>
          <h2>Посмотреть потом</h2>
          <div className="review-mail-list">
            {mailItems.slice(0, 5).map((item) => (
              <button key={item.id} onClick={() => onNavigate("inbox")}>
                <FileText size={15} />
                <span>{item.title}</span>
                <ChevronRight size={14} />
              </button>
            ))}
            {!mailItems.length ? (
              <small>Новых писем для разбора нет</small>
            ) : null}
          </div>
          <button className="quiet-link" onClick={() => onNavigate("inbox")}>
            Открыть входящие <ChevronRight size={14} />
          </button>
        </section>
      </div>
      {pendingLessons.length ? (
        <section className="lesson-confirmations">
          <header>
            <div>
              <span>ПРОШЕДШИЕ УРОКИ · {pendingLessons.length}</span>
              <h2>Урок состоялся?</h2>
            </div>
            <p>Ответ обновит историю ученика и календарь.</p>
          </header>
          <div>
            {pendingLessons.map((lesson) => (
              <article key={lesson.id}>
                <div>
                  <b>{lesson.student.name}</b>
                  <span>
                    {lessonDateFormatter.format(new Date(lesson.starts_at))}
                  </span>
                </div>
                <div>
                  <button
                    onClick={() => void onConfirmLesson(lesson.id, "held")}
                  >
                    <Check size={15} /> Был
                  </button>
                  <button
                    className="lesson-cancelled"
                    onClick={() => void onConfirmLesson(lesson.id, "cancelled")}
                  >
                    Не был
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
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
  const [acknowledged, setAcknowledged] = React.useState<Set<string>>(
    () => new Set()
  );
  const unfinished = tasks.filter(
    (task) => task.due === "today" && !task.done && !acknowledged.has(task.id)
  );
  const completedToday = tasks.filter(
    (task) => task.done && isLocalDateToday(task.completedAt)
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
                    <button
                      className="leave-overdue"
                      type="button"
                      onClick={() =>
                        setAcknowledged((current) => {
                          const next = new Set(current);
                          next.add(task.id);
                          return next;
                        })
                      }
                    >
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
  tone: "overdue" | "today" | "future";
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
              <small>
                {task.category}
                {tone === "future" ? ` · ${task.date}` : ""}
              </small>
              <ChevronRight size={14} />
            </button>
          ))
        ) : (
          <div className="review-empty">
            <Check size={18} />{" "}
            {tone === "overdue"
              ? "Ничего не просрочено."
              : tone === "today"
                ? "На сегодня пока нет задач."
                : "Будущие задачи ещё не запланированы."}
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
function isLocalDateToday(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  return (
    !Number.isNaN(date.getTime()) && localDateString(date) === localDateString()
  );
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
function recurrenceToLabel(
  value: PlannerTaskRow["recurrence"]
): Task["repeat"] {
  if (value === "weekly") return "Каждую неделю";
  if (value === "monthly") return "Каждый месяц";
  return "Нет";
}
function labelToRecurrence(
  value: Task["repeat"]
): PlannerTaskRow["recurrence"] {
  if (value === "Каждую неделю") return "weekly";
  if (value === "Каждый месяц") return "monthly";
  return "none";
}
function TaskModal({
  task,
  onClose,
  onComplete,
  onUpdate,
  onDelete,
}: {
  task: Task;
  onClose: () => void;
  onComplete: (id: string) => Promise<void>;
  onUpdate: (task: Task) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState(task);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const change = (field: keyof Task, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const save = async (complete = false) => {
    setError(null);
    setIsSaving(true);
    try {
      await onUpdate(draft);
      if (complete) await onComplete(task.id);
      onClose();
    } catch {
      setError("Не удалось сохранить задачу. Повторите ещё раз.");
      setIsSaving(false);
    }
  };
  const remove = async () => {
    if (!window.confirm("Удалить эту задачу?")) return;
    setError(null);
    setIsDeleting(true);
    try {
      await onDelete(task.id);
      onClose();
    } catch {
      setError("Не удалось удалить задачу. Повторите ещё раз.");
      setIsDeleting(false);
    }
  };
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
            value={draft.dueDate ?? ""}
            onChange={(event) => change("dueDate", event.target.value)}
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
      <button
        className="attachment-button"
        type="button"
        disabled
        title="Вложения будут подключены следующим этапом"
      >
        <Paperclip size={15} /> Вложения — следующим этапом
      </button>
      {error ? <p className="modal-error">{error}</p> : null}
      <div className="modal-footer">
        <button
          className="delete-button"
          disabled={isSaving || isDeleting}
          onClick={() => void remove()}
        >
          <Trash2 size={15} /> {isDeleting ? "Удаляю…" : "Удалить"}
        </button>
        <button
          className="save-task"
          disabled={isSaving || isDeleting || !draft.title.trim()}
          onClick={() => void save()}
        >
          {isSaving ? "Сохраняю…" : "Сохранить"}
        </button>
        <button
          className="complete-modal"
          disabled={isSaving || isDeleting || !draft.title.trim()}
          onClick={() => void save(true)}
        >
          <CircleCheck size={16} /> {task.done ? "Вернуть" : "Завершить"}
        </button>
      </div>
    </Modal>
  );
}
function CreateTaskModal({
  category,
  initialTitle,
  isCreating,
  error,
  onClose,
  onCreate,
}: {
  category: Category;
  initialTitle?: string;
  isCreating: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (task: TaskDraft) => void;
}) {
  const [title, setTitle] = React.useState(initialTitle ?? "");
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
      {error ? <p className="modal-error">{error}</p> : null}
      <button
        disabled={!title.trim() || isCreating}
        className="complete-modal"
        onClick={() =>
          onCreate({
            title: title.trim(),
            category: target,
            dueDate: date || null,
            time,
            repeat,
          })
        }
      >
        <Plus size={16} /> {isCreating ? "Создаю…" : "Создать"}
      </button>
    </Modal>
  );
}
function LessonModal({
  lesson,
  onClose,
  onSave,
  onDelete,
}: {
  lesson: PlannerEvent;
  onClose: () => void;
  onSave: (topic: string, homework: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [topic, setTopic] = React.useState(lesson.lessonNotes?.topic ?? "");
  const [homework, setHomework] = React.useState(
    lesson.lessonNotes?.homework ?? ""
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await onSave(topic, homework);
    } catch {
      setError("Не удалось сохранить урок. Повторите ещё раз.");
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Удалить этот урок из календаря?")) return;
    setError(null);
    setIsDeleting(true);
    try {
      await onDelete();
    } catch {
      setError("Не удалось удалить урок. Повторите ещё раз.");
      setIsDeleting(false);
    }
  };

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
        <input
          placeholder="Что проходили?"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
        />
      </label>
      <label>
        Домашнее задание
        <textarea
          placeholder="Свободный текст для ученика"
          value={homework}
          onChange={(event) => setHomework(event.target.value)}
        />
      </label>
      {error ? <p className="modal-error">{error}</p> : null}
      <div className="modal-footer">
        <button
          className="delete-button"
          disabled={isSaving || isDeleting}
          onClick={() => void remove()}
        >
          <Trash2 size={15} /> {isDeleting ? "Удаляю…" : "Удалить"}
        </button>
        <button
          className="complete-modal"
          disabled={isSaving || isDeleting}
          onClick={() => void save()}
        >
          <Check size={16} /> {isSaving ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>
    </Modal>
  );
}

function NotificationSettingsModal({ onClose }: { onClose: () => void }) {
  const desktop = isDesktop();
  const [permission, setPermission] =
    React.useState<NotificationPermissionState>("prompt");
  const [autoLaunch, setAutoLaunchState] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    void Promise.all([getNotificationPermission(), getAutoLaunch()]).then(
      ([nextPermission, nextAutoLaunch]) => {
        if (!active) return;
        setPermission(nextPermission);
        setAutoLaunchState(nextAutoLaunch);
        setIsBusy(false);
      }
    );
    return () => {
      active = false;
    };
  }, []);

  const enable = async () => {
    setError(null);
    setIsBusy(true);
    const nextPermission = await requestNotificationPermission();
    setPermission(nextPermission);
    if (nextPermission === "granted") {
      const autoLaunchEnabled = await setAutoLaunch(true);
      setAutoLaunchState(autoLaunchEnabled);
      window.dispatchEvent(new Event("nplan-notifications-changed"));
      await showNotification({
        title: "NPlan готов напоминать",
        body: "Утренняя и вечерняя сводки, дедлайны и уроки включены.",
      });
    } else if (nextPermission === "denied") {
      setError("Разрешите уведомления для NPlan в настройках macOS.");
    }
    setIsBusy(false);
  };

  const toggleAutoLaunch = async () => {
    setError(null);
    setIsBusy(true);
    const next = !autoLaunch;
    if (await setAutoLaunch(next)) setAutoLaunchState(next);
    else setError("Не удалось изменить автозапуск.");
    setIsBusy(false);
  };

  const test = async () => {
    setError(null);
    try {
      await showNotification({
        title: "Тестовое уведомление NPlan",
        body: "Всё работает — важные задачи не потеряются.",
      });
    } catch {
      setError("Не удалось показать уведомление.");
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="modal-top">
        <span>УВЕДОМЛЕНИЯ</span>
        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <h2>Не пропустить важное.</h2>
      {!desktop ? (
        <p className="notification-copy">
          Системные уведомления доступны в приложении NPlan для Mac. Веб-версия
          продолжит показывать сводки внутри планнера.
        </p>
      ) : (
        <>
          <div className="notification-list">
            <div>
              <b>10:15</b>
              <span>Утренняя сводка</span>
            </div>
            <div>
              <b>17:50</b>
              <span>Закрыть день и разобрать входящие</span>
            </div>
            <div>
              <b>−1 час</b>
              <span>Напоминание об уроке</span>
            </div>
            <div>
              <b>В срок</b>
              <span>Задача с указанным временем</span>
            </div>
          </div>
          {permission === "granted" ? (
            <div className="notification-status is-enabled">
              <Check size={16} /> Системные уведомления включены
            </div>
          ) : null}
          <button
            className="notification-toggle"
            type="button"
            disabled={isBusy || permission !== "granted"}
            onClick={() => void toggleAutoLaunch()}
          >
            <span>
              <b>Запускать вместе с Mac</b>
              <small>Чтобы напоминания приходили без открытого окна</small>
            </span>
            <i className={autoLaunch ? "is-on" : ""} aria-hidden="true" />
          </button>
          {error ? <p className="modal-error">{error}</p> : null}
          <div className="notification-actions">
            {permission !== "granted" ? (
              <button
                className="complete-modal"
                disabled={isBusy || permission === "unsupported"}
                onClick={() => void enable()}
              >
                <Bell size={16} />
                {isBusy ? "Проверяю…" : "Включить уведомления"}
              </button>
            ) : (
              <button
                className="complete-modal"
                disabled={isBusy}
                onClick={() => void test()}
              >
                <Bell size={16} /> Проверить уведомление
              </button>
            )}
          </div>
        </>
      )}
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
