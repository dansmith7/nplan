import { test, expect } from "bun:test";
import {
  calendarChangeText,
  deliverCalendarChanges,
  type CalendarChange,
} from "./changes";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
const change: CalendarChange = {
  id: "alert1",
  source_id: "meeting",
  revision: 1,
  kind: "moved",
  title: "Урок с Алисой",
  before_start: "2026-11-05T08:00:00Z",
  before_end: "2026-11-05T09:00:00Z",
  after_start: "2026-11-06T09:00:00Z",
  after_end: "2026-11-06T10:00:00Z",
  attempts: 1,
  status: "sending",
};
test("move includes both dates, exact local times and a planner link", () => {
  const text = calendarChangeText(change, "Europe/Istanbul");
  expect(text).toContain("Встреча перенесена");
  expect(text).toContain("Было: четверг");
  expect(text).toContain("11:00");
  expect(text).toContain("Стало: пятница");
  expect(text).toContain("12:00");
  expect(text).toContain("https://nplan-tau.vercel.app/app");
});
test("cancellation needs no live calendar row and never prints a new date", () => {
  const text = calendarChangeText(
    { ...change, kind: "cancelled", after_start: null, after_end: null },
    "Europe/Istanbul"
  );
  expect(text).toContain("Встреча отменена");
  expect(text).toContain("Была запланирована");
  expect(text).not.toContain("Стало:");
});
test("end-time change shows both old and new finish times", () => {
  const text = calendarChangeText(
    {
      ...change,
      after_start: change.before_start,
      after_end: "2026-11-05T10:00:00Z",
    },
    "Europe/Istanbul"
  );
  expect(text).toContain("— 12:00");
  expect(text).toContain("— 13:00");
});
function dbMock(current: CalendarChange | null = change) {
  const writes: Array<Record<string, unknown>> = [];
  const db = {
    from() {
      const q = {
        update(v: Record<string, unknown>) {
          writes.push(v);
          return q;
        },
        eq() {
          return q;
        },
        lt: async () => ({ error: null }),
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return q;
    },
    rpc: async (name: string) => ({
      data:
        name === "claim_telegram_calendar_changes"
          ? [change]
          : current
            ? [current]
            : [],
      error: null,
    }),
  } as unknown as SupabaseClient;
  return { db, writes };
}
test("a sync started before send defers delivery instead of sending stale times", async () => {
  const { db, writes } = dbMock(null);
  let sends = 0;
  const result = await deliverCalendarChanges(
    db,
    "unused",
    "123",
    "owner",
    "Europe/Istanbul",
    async () => {
      sends++;
      return Response.json({ ok: true, result: { message_id: 1 } });
    }
  );
  expect(sends).toBe(0);
  expect(result.deferred).toBe(1);
  expect(writes).toContainEqual({ status: "pending", attempts: 0 });
});
test("transport ambiguity is persisted as uncertain and never blindly resent", async () => {
  const { db, writes } = dbMock();
  const result = await deliverCalendarChanges(
    db,
    "unused",
    "123",
    "owner",
    "Europe/Istanbul",
    async () => {
      throw Error("timeout after acceptance");
    }
  );
  expect(result.uncertain).toBe(1);
  expect(writes).toContainEqual({
    status: "uncertain",
    error_code: "telegram_transport_unknown",
  });
});

test("successful alert persists the actual Telegram message ID", async () => {
  const { db, writes } = dbMock();
  const result = await deliverCalendarChanges(
    db,
    "unused",
    "123",
    "owner",
    "Europe/Istanbul",
    async () => Response.json({ ok: true, result: { message_id: 42 } })
  );
  expect(result.sent).toBe(1);
  expect(
    writes.some(
      (w) =>
        w.status === "sent" &&
        w.telegram_message_id === 42 &&
        typeof w.delivered_at === "string"
    )
  ).toBe(true);
});
