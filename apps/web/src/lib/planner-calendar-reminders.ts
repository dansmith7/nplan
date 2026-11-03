export type CalendarReminderRow = {
  id: string;
  title: string;
  description: string;
  due_at: string;
  revision: number;
  status: string;
};
export function reminderCalendarRow(row: CalendarReminderRow) {
  return {
    id: `reminder:${row.id}`,
    task_id: null,
    student_id: null,
    kind: "reminder" as const,
    title: row.title,
    description: row.description,
    starts_at: row.due_at,
    // A visual marker, not a meeting with a duration or advance notifications.
    ends_at: new Date(
      new Date(row.due_at).getTime() + 15 * 60_000
    ).toISOString(),
    recurrence: "none" as const,
    student: null,
    notes: null,
    collection_item_id: null,
    reminder_revision: row.revision,
    reminder_status: row.status,
  };
}
export function checkReminderChange(result: { ok: boolean; reason?: string }) {
  if (result.ok) return;
  const messages: Record<string, string> = {
    stale:
      "Напоминание уже изменилось в боте. Закрой окно и открой его заново.",
    busy: "Напоминание сейчас отправляется. Повтори через несколько секунд.",
    finished: "Напоминание уже завершено или отменено. Обнови календарь.",
    not_found: "Напоминание не найдено. Обнови календарь.",
    invalid_time: "Для переноса выбери будущее время.",
    invalid_title: "Укажи название от 1 до 500 символов.",
  };
  throw new Error(
    messages[result.reason ?? ""] ??
      "Не удалось изменить напоминание. Повтори ещё раз."
  );
}

/** Preserve the original seconds when the visible calendar time was not changed. */
export function reminderStartAt(date: Date, originalStart?: string): Date {
  if (!originalStart) return date;
  const original = new Date(originalStart);
  return original.getFullYear() === date.getFullYear() &&
    original.getMonth() === date.getMonth() &&
    original.getDate() === date.getDate() &&
    original.getHours() === date.getHours() &&
    original.getMinutes() === date.getMinutes()
    ? original
    : date;
}
