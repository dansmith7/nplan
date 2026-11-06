import { test, expect } from "bun:test";
import { isReminderTimeAnswer as isTime } from "./reminder-time-answer";
test("bare time answers are distinct from new task text", () => {
  for (const text of [
    "сегодня в 9:05",
    "завтра в 09:05",
    "09:05",
    "в 7 вечера",
    "послезавтра утром",
    "в пятницу в 18:30",
    "06.11 в 10:30",
    "2026-11-07 в 14:00",
    "через полчаса",
    "через 1,5 часа",
    "отмена",
    "завтра в 25:00",
  ])
    expect(isTime(text)).toBe(true);
  for (const text of [
    "купить хлеб завтра в 9:05",
    "позвонить через час",
    "Прайм тайм",
    "взять с собой еду",
    "каждый день в 9:05",
    "мой 9:05 автобус",
    "завтра",
    "",
    "/reminders",
  ])
    expect(isTime(text)).toBe(false);
});
