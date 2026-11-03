import { describe, test, expect } from "bun:test";
import {
  parseReminderTime as parse,
  wallTime,
  quickPreset,
  readCallback,
  initialButtons,
  manageButtons,
  type QuickReminder,
} from "./quick-reminders";
import { sendReminder } from "../telegram-reminders/core";
const zone = "Europe/Istanbul";
const now = new Date("2026-11-03T08:00:00Z"); // 11:00 local
const r: QuickReminder = {
  id: "24faf5c3-16df-4ba7-8045-72732ef631da",
  user_id: "test",
  chat_id: 1,
  inbox_id: "test",
  title: "Оплатить интернет",
  raw_text: "",
  timezone: zone,
  proposed_at: null,
  due_at: null,
  revision: 0,
  status: "draft",
};
describe("Russian reminder times", () => {
  test.each([
    [
      "Завтра в 19:30 сходить в аптеку",
      "2026-11-04T16:30:00.000Z",
      "сходить в аптеку",
    ],
    [
      "Завтра в 19:30 оплатить интернет",
      "2026-11-04T16:30:00.000Z",
      "оплатить интернет",
    ],
    [
      "Напомни мне забрать посылку завтра в 18:30",
      "2026-11-04T15:30:00.000Z",
      "забрать посылку",
    ],
    ["Оплатить через час", "2026-11-03T09:00:00.000Z", "Оплатить"],
    ["Перерыв через 15 минут", "2026-11-03T08:15:00.000Z", "Перерыв"],
    [
      "Через полчаса проверить почту",
      "2026-11-03T08:30:00.000Z",
      "проверить почту",
    ],
    [
      "Через 1,5 часа проверить почту",
      "2026-11-03T09:30:00.000Z",
      "проверить почту",
    ],
    ["В пятницу в 18:00 позвонить", "2026-11-06T15:00:00.000Z", "позвонить"],
    ["05.11 в 10:30 проверить", "2026-11-05T07:30:00.000Z", "проверить"],
    ["2026-11-05 в 10:30 проверить", "2026-11-05T07:30:00.000Z", "проверить"],
    ["Послезавтра утром позвонить", "2026-11-05T06:00:00.000Z", "позвонить"],
    ["Завтра в 7 вечера позвонить", "2026-11-04T16:00:00.000Z", "позвонить"],
    ["Купить билеты в 09:00", "2026-11-04T06:00:00.000Z", "Купить билеты"],
    ["Позвонить в 23:59", "2026-11-03T20:59:00.000Z", "Позвонить"],
    ["Завтра в 00:00 проверить", "2026-11-03T21:00:00.000Z", "проверить"],
  ])("%s", (text, dueAt, title) => {
    expect(parse(text, zone, now)).toEqual({ title, dueAt, issue: null });
  });
  test.each([
    "Купить молоко",
    "Проверить https://example.com",
    "Завтра оплатить",
    "05.11 позвонить",
  ])("does not invent a time: %s", (text) =>
    expect(parse(text, zone, now).dueAt).toBeNull()
  );
  test.each([
    "Завтра в 25:00 проверить",
    "Завтра в 19:99 проверить",
    "31.11.2026 в 10:30 проверить",
    "Сегодня в 09:00 проверить",
    "Через 0 минут проверить",
    "Каждый день в 10:00 проверить",
    "Завтра в 10:00 или 11:00 проверить",
    "Завтра через час проверить",
  ])("requires an explicit choice: %s", (text) =>
    expect(parse(text, zone, now).dueAt).toBeNull()
  );
  test("timezone changes the date at UTC midnight", () => {
    expect(
      parse(
        "Завтра в 09:00 проверить",
        "Asia/Shanghai",
        new Date("2026-11-03T20:00:00Z")
      ).dueAt
    ).toBe("2026-11-05T01:00:00.000Z");
    expect(
      parse("Завтра в 09:00 проверить", zone, new Date("2026-11-03T20:00:00Z"))
        .dueAt
    ).toBe("2026-11-04T06:00:00.000Z");
  });
  test("rejects nonexistent/ambiguous DST wall times", () => {
    expect(wallTime(2026, 3, 29, 2, 30, "Europe/Berlin")).toBeNull();
    expect(wallTime(2026, 10, 25, 2, 30, "Europe/Berlin")).toBeNull();
  });
  test("a time-only weekday in the past means next week", () =>
    expect(parse("Во вторник в 09:00 позвонить", zone, now).dueAt).toBe(
      "2026-11-10T06:00:00.000Z"
    ));
});
describe("callback contracts", () => {
  test("creation payload survives Telegram 64-byte limit", () => {
    const button = initialButtons({ ...r, proposed_at: "2026-11-04T16:30:00Z" })
      .inline_keyboard[0][0];
    expect(
      new TextEncoder().encode(button.callback_data).length
    ).toBeLessThanOrEqual(64);
    expect(readCallback(button.callback_data)).toEqual({
      id: r.id,
      revision: 0,
      action: "create",
    });
  });
  test("rejects invalid action and IDs", () => {
    expect(readCallback(`nr:${r.id}:0:delete_all`)).toBeNull();
    expect(readCallback("nr:another-user:0:15")).toBeNull();
  });
  test("delivered reminder has snooze; finished reminder has no actions", () => {
    expect(
      manageButtons({ ...r, revision: 1, status: "sent" }).inline_keyboard[0][0]
        .callback_data
    ).toBe(`nr:${r.id}:1:15`);
    expect(manageButtons({ ...r, status: "done" }).inline_keyboard).toEqual([]);
    expect(
      manageButtons({ ...r, status: "cancelled" }).inline_keyboard
    ).toEqual([]);
  });
  test("late evening is not silently moved to tomorrow", () => {
    expect(
      quickPreset("tonight", zone, new Date("2026-11-03T20:00:00Z"))
    ).toBeNull();
    expect(quickPreset("tom9", zone, now)).toBe("2026-11-04T06:00:00.000Z");
  });
  test("delivery includes management buttons and uses the actual returned message ID", async () => {
    let payload: Record<string, unknown> = {};
    const markup = manageButtons({ ...r, status: "sent" });
    const result = await sendReminder(
      "test-token",
      "1",
      "text",
      (async (_url, init) => {
        payload = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({ ok: true, result: { message_id: 42 } })
        );
      }) as typeof fetch,
      markup
    );
    expect(payload.reply_markup).toEqual(markup);
    expect(result.status).toBe("sent");
    expect(result.telegram_message_id).toBe(42);
  });
});
