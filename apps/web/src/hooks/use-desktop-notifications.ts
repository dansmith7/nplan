import * as React from "react";
import type { PlannerProfile } from "@/lib/planner-data";
import { requireSupabase } from "@/lib/supabase";
import {
  getNotificationPermission,
  isDesktop,
  showNotification,
} from "@/lib/desktop";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

type ActiveTask = {
  id: string;
  title: string;
  due_date: string | null;
};

type ReminderEvent = {
  id: string;
  kind: "task" | "lesson";
  title: string;
  starts_at: string;
  student: { name: string } | null;
  notes: { status: "scheduled" | "held" | "cancelled" } | null;
};

type BirthdayReminderEvent = {
  id: string;
  title: string;
  starts_at: string;
};

type ZonedNow = {
  date: string;
  year: number;
  month: number;
  day: number;
  minutes: number;
};

function getZonedNow(value: Date, timezone: string): ZonedNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const hour = part("hour");
  const minute = part("minute");
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    day,
    minutes: hour * 60 + minute,
  };
}

function timeToMinutes(value: string) {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function dailyMarker(now: ZonedNow) {
  return new Date(Date.UTC(now.year, now.month - 1, now.day)).toISOString();
}

function groupByStart(events: ReminderEvent[]) {
  const groups = new Map<string, ReminderEvent[]>();
  for (const event of events) {
    const current = groups.get(event.starts_at) ?? [];
    current.push(event);
    groups.set(event.starts_at, current);
  }
  return groups;
}

async function deliverOnce(input: {
  userId: string;
  kind:
    | "morning_review"
    | "evening_review"
    | "task_deadline"
    | "lesson_reminder"
    | "birthday_reminder";
  scheduledFor: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("notification_log")
    .insert({
      user_id: input.userId,
      kind: input.kind,
      scheduled_for: input.scheduledFor,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single<{ id: string }>();

  if (error?.code === "23505") return;
  if (error) throw error;

  try {
    await showNotification({ title: input.title, body: input.body });
    await client
      .from("notification_log")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", data.id);
  } catch (notificationError) {
    await client.from("notification_log").delete().eq("id", data.id);
    throw notificationError;
  }
}

async function runNotificationCheck(profile: PlannerProfile, userId: string) {
  if ((await getNotificationPermission()) !== "granted") return;

  const client = requireSupabase();
  const currentDate = new Date();
  const now = getZonedNow(currentDate, profile.timezone);
  const morning = timeToMinutes(profile.morning_review_time);
  const evening = timeToMinutes(profile.evening_review_time);

  const taskQuery = client
    .from("tasks")
    .select("id, title, due_date")
    .eq("status", "in_progress")
    .returns<ActiveTask[]>();
  // Start the independent inbox count at the same time as the task query.
  const inboxQuery =
    now.minutes >= evening
      ? client
          .from("inbox_items")
          .select("id", { count: "exact", head: true })
          .eq("status", "new")
      : null;
  const { data: taskRows, error: taskError } = await taskQuery;
  if (taskError) throw taskError;

  const overdue = taskRows.filter(
    (task) => task.due_date && task.due_date < now.date
  ).length;
  const today = taskRows.filter((task) => task.due_date === now.date).length;
  const marker = dailyMarker(now);

  if (now.minutes >= morning && now.minutes < evening) {
    await deliverOnce({
      userId,
      kind: "morning_review",
      scheduledFor: marker,
      title: "Доброе утро. План на сегодня",
      body: `${overdue} просрочено · ${today} на сегодня`,
      metadata: { overdue, today, localDate: now.date },
    });
  }

  if (now.minutes >= evening) {
    // Inbox is checked only for the evening review. This keeps the regular
    // minute-by-minute reminder loop light while making stale incoming items
    // visible before the workday ends.
    const { count: inboxCount, error: inboxError } = await inboxQuery!;
    if (inboxError) throw inboxError;

    const remainingInbox = inboxCount ?? 0;
    const summary = [
      today ? `На сегодня осталось задач: ${today}` : null,
      remainingInbox ? `Входящих ждёт разбора: ${remainingInbox}` : null,
    ].filter(Boolean);

    await deliverOnce({
      userId,
      kind: "evening_review",
      scheduledFor: marker,
      title: "Пора закрыть день",
      body: summary.length
        ? `${summary.join(" · ")}.`
        : "Все задачи на сегодня закрыты, входящие разобраны.",
      metadata: {
        remainingToday: today,
        remainingInbox,
        localDate: now.date,
      },
    });
  }

  const pastWindow = new Date(currentDate.getTime() - 15 * 60_000);
  const futureWindow = new Date(currentDate.getTime() + 65 * 60_000);
  const [eventResult, birthdayResult] = await Promise.all([
    client.from("calendar_events")
      .select("id, kind, title, starts_at, student:students(name), notes:lesson_notes(status)")
      .in("kind", ["task", "lesson"])
      .gte("starts_at", pastWindow.toISOString()).lte("starts_at", futureWindow.toISOString())
      .returns<ReminderEvent[]>(),
    client.from("test_collection_calendar_events")
      .select("id,title,starts_at")
      .gte("starts_at", pastWindow.toISOString()).lte("starts_at", futureWindow.toISOString())
      .returns<BirthdayReminderEvent[]>(),
  ]);
  if (eventResult.error) throw eventResult.error;
  if (birthdayResult.error) throw birthdayResult.error;
  const eventRows = eventResult.data;

  const taskEvents = eventRows.filter((event) => {
    if (event.kind !== "task") return false;
    const startsAt = new Date(event.starts_at).getTime();
    return startsAt <= currentDate.getTime() && startsAt > pastWindow.getTime();
  });
  const lessonEvents = eventRows.filter((event) => {
    if (event.kind !== "lesson" || event.notes?.status !== "scheduled")
      return false;
    const minutesUntil =
      (new Date(event.starts_at).getTime() - currentDate.getTime()) / 60_000;
    return minutesUntil > 0 && minutesUntil <= 65;
  });

  for (const [startsAt, events] of groupByStart(taskEvents)) {
    await deliverOnce({
      userId,
      kind: "task_deadline",
      scheduledFor: startsAt,
      title: events.length === 1 ? "Дедлайн задачи" : "Дедлайн задач",
      body:
        events.length === 1
          ? events[0]!.title
          : `${events.length} задачи: ${events
              .map((event) => event.title)
              .join(", ")}`,
      metadata: { eventIds: events.map((event) => event.id) },
    });
  }

  for (const [startsAt, events] of groupByStart(lessonEvents)) {
    const minutesUntil = Math.max(
      1,
      Math.round(
        (new Date(startsAt).getTime() - currentDate.getTime()) / 60_000
      )
    );
    await deliverOnce({
      userId,
      kind: "lesson_reminder",
      scheduledFor: startsAt,
      title:
        minutesUntil >= 55
          ? events.length === 1
            ? "Урок через час"
            : "Уроки через час"
          : `${events.length === 1 ? "Урок" : "Уроки"} через ${minutesUntil} мин.`,
      body: events
        .map((event) => event.student?.name ?? event.title)
        .join(", "),
      metadata: { eventIds: events.map((event) => event.id) },
    });
  }

  for (const event of birthdayResult.data) {
    await deliverOnce({
      userId,
      kind: "birthday_reminder",
      scheduledFor: event.starts_at,
      title: "Сегодня день рождения",
      body: event.title.replace(/^День рождения ·\s*/, ""),
      metadata: { eventId: event.id },
    });
  }
}

export function useDesktopNotifications(profile?: PlannerProfile) {
  const { session } = useSupabaseSession();

  React.useEffect(() => {
    if (!isDesktop() || !profile || !session?.user.id) return;
    let disposed = false;
    let running = false;

    const check = async () => {
      if (disposed || running) return;
      running = true;
      try {
        await runNotificationCheck(profile, session.user.id);
      } catch (error) {
        console.error("Desktop notification check failed:", error);
      } finally {
        running = false;
      }
    };

    const handleSettingsChange = () => void check();
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    window.addEventListener(
      "nplan-notifications-changed",
      handleSettingsChange
    );
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener(
        "nplan-notifications-changed",
        handleSettingsChange
      );
    };
  }, [profile, session?.user.id]);
}
