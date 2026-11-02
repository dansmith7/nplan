import { describe, expect, it } from "bun:test";
import { isCurrentEvent, reminderText, sendReminder, type Event } from "./core";
const now = new Date("2026-11-03T07:00:00Z");
const event: Event = {
  title: "Занятие · Тест",
  kind: "lesson",
  starts_at: "2026-11-03T08:00:00Z",
  student: { name: "Тест" },
  notes: { status: "scheduled" },
};
const reminder = {
  id: "id",
  event_id: "event",
  starts_at: event.starts_at,
  lead_minutes: 60,
};
const reply = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
describe("Telegram event reminders", () => {
  it("formats hour, half-hour and ten-minute notifications in the profile timezone", () => {
    for (const [minutes, label] of [
      [60, "через 1 час"],
      [30, "через 30 мин."],
      [10, "через 10 мин."],
    ] as const) {
      const text = reminderText(
        event,
        "Europe/Istanbul",
        new Date(new Date(event.starts_at).getTime() - minutes * 60_000)
      );
      expect(text).toContain(`Урок ${label}`);
      expect(text).toContain("11:00");
      expect(text).toContain("Ученик: Тест");
    }
  });
  it("uses actual minutes when the scheduler is slightly late", () => {
    expect(
      reminderText(event, "Europe/Istanbul", new Date("2026-11-03T07:31:00Z"))
    ).toContain("через 29 мин.");
    expect(
      reminderText(
        { ...event, kind: "meeting", student: null },
        "Asia/Shanghai",
        now
      )
    ).toContain("16:00");
  });
  it("suppresses cancelled, completed, moved, deleted and already-started events", () => {
    expect(isCurrentEvent(event, reminder, now)).toBe(true);
    for (const changed of [
      null,
      { ...event, notes: { status: "cancelled" } },
      { ...event, notes: { status: "held" } },
      { ...event, starts_at: "2026-11-03T09:00:00Z" },
      { ...event, kind: "task" },
    ]) {
      expect(isCurrentEvent(changed, reminder, now)).toBe(false);
    }
    expect(isCurrentEvent(event, reminder, new Date(event.starts_at))).toBe(
      false
    );
  });
  it("records Telegram's returned message id only on confirmed success", async () => {
    expect(
      await sendReminder(
        "test",
        "test",
        "test",
        reply({ ok: true, result: { message_id: 123 } })
      )
    ).toMatchObject({ status: "sent", telegram_message_id: 123 });
  });
  it("retries explicit rate limiting, but does not retry permanent rejection", async () => {
    const result = await sendReminder(
      "test",
      "test",
      "test",
      reply(
        { ok: false, error_code: 429, parameters: { retry_after: 120 } },
        429
      )
    );
    expect(result.status).toBe("failed");
    expect(new Date(result.next_attempt_at!).getTime()).toBeGreaterThan(
      Date.now() + 119_000
    );
    expect(
      await sendReminder(
        "test",
        "test",
        "test",
        reply({ ok: false, error_code: 403 }, 403)
      )
    ).toMatchObject({ status: "skipped", error_code: "telegram_403" });
  });
  it("does not resend when delivery outcome is ambiguous", async () => {
    const networkFailure = (async () => {
      throw new Error("network");
    }) as typeof fetch;
    expect(
      (await sendReminder("test", "test", "test", networkFailure)).status
    ).toBe("uncertain");
    expect(
      (
        await sendReminder(
          "test",
          "test",
          "test",
          (async () => new Response("invalid")) as typeof fetch
        )
      ).status
    ).toBe("uncertain");
    expect(
      (await sendReminder("test", "test", "test", reply({ ok: true }))).status
    ).toBe("uncertain");
  });
});
