import { test, expect } from "bun:test";
import { handleQuickCallback, consumeTimeReply, type Context } from "./quick";
import { callback, type QuickReminder } from "../_shared/quick-reminders";
const row: QuickReminder = {
  id: "24faf5c3-16df-4ba7-8045-72732ef631da",
  user_id: "owner",
  chat_id: "123",
  inbox_id: "inbox",
  title: "Позвонить",
  raw_text: "Позвонить завтра",
  timezone: "Europe/Istanbul",
  proposed_at: "2026-11-04T16:30:00Z",
  due_at: null,
  status: "draft",
  revision: 0,
};
function fixture(
  current: QuickReminder = { ...row },
  input: Record<string, unknown> | null = null
) {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const apiCalls: Array<{ method: string; text: string; markup?: unknown }> =
    [];
  const filters: Array<[string, unknown]> = [];
  const db = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        maybeSingle: async () => ({
          data: table === "telegram_reminder_inputs" ? input : current,
          error: null,
        }),
      };
      return query;
    },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      rpcCalls.push(args);
      current = {
        ...current,
        status: args.p_action === "cancel" ? "cancelled" : "scheduled",
        due_at: args.p_due_at as string,
        revision: current.revision + 1,
      };
      return { data: { ok: true, reminder: current }, error: null };
    },
  };
  const c = {
    db,
    ownerId: "owner",
    chatId: "123",
    timezone: "Europe/Istanbul",
    now: () => new Date("2026-11-03T12:00:00Z"),
    api: {
      send: async (_chat: string, text: string, markup?: unknown) => {
        apiCalls.push({ method: "send", text, markup });
        return 42;
      },
      edit: async (
        _chat: string,
        _id: number,
        text: string,
        markup: unknown
      ) => {
        apiCalls.push({ method: "edit", text, markup });
        return {};
      },
    },
  } as unknown as Context;
  return { c, rpcCalls, apiCalls, filters };
}
test("a second tap on the same card does not mutate the schedule again", async () => {
  const f = fixture();
  await handleQuickCallback(f.c, callback(row, "create"), 42);
  await handleQuickCallback(f.c, callback(row, "create"), 42);
  expect(f.rpcCalls).toHaveLength(1);
  expect(f.rpcCalls[0].p_due_at).toBe(row.proposed_at);
  expect(f.filters).toContainEqual(["user_id", "owner"]);
  expect(f.filters).toContainEqual(["chat_id", "123"]);
});
test("a stale Done button cannot complete a rescheduled reminder", async () => {
  const f = fixture({
    ...row,
    status: "scheduled",
    revision: 2,
    due_at: "2026-11-05T10:00:00Z",
  });
  await handleQuickCallback(f.c, callback(row, "done"), 42);
  expect(f.rpcCalls).toHaveLength(0);
  expect(f.apiCalls[0].method).toBe("edit");
  expect(f.apiCalls[0].text).toContain("5 ноября");
});
test("a custom time reply updates the intended reminder and is consumed as a reply", async () => {
  const f = fixture(
    { ...row },
    { reminder_id: row.id, revision: 0, expires_at: "2026-11-04T12:00:00Z" }
  );
  expect(await consumeTimeReply(f.c, 7, "Завтра в 19:30")).toBe(true);
  expect(f.rpcCalls[0].p_id).toBe(row.id);
  expect(f.rpcCalls[0].p_due_at).toBe("2026-11-04T16:30:00.000Z");
});
test("expired time prompts do not mutate reminders or become new inbox entries", async () => {
  const f = fixture(
    { ...row },
    { reminder_id: row.id, revision: 0, expires_at: "2026-11-02T12:00:00Z" }
  );
  expect(await consumeTimeReply(f.c, 7, "Через час")).toBe(true);
  expect(f.rpcCalls).toHaveLength(0);
  expect(f.apiCalls[0].text).toContain("устарел");
});
test("a regular message or unrelated reply remains available to the inbox handler", async () => {
  const f = fixture();
  expect(await consumeTimeReply(f.c, undefined, "Текст задачи")).toBe(false);
  expect(await consumeTimeReply(f.c, 7, "Текст задачи")).toBe(false);
  expect(f.rpcCalls).toHaveLength(0);
  expect(f.apiCalls).toHaveLength(0);
});

test("Undo reaches the guarded mutation even for a terminal reminder", async () => {
  const r = {
    ...row,
    status: "done" as const,
    revision: 3,
    undo_until: new Date(Date.now() + 60000).toISOString(),
  };
  const f = fixture(r);
  await handleQuickCallback(f.c, callback(r, "undo"), 42);
  expect(f.rpcCalls[0].p_action).toBe("undo");
  expect(f.rpcCalls[0].p_revision).toBe(3);
});
test("repeat menu selects a recurrence through the service RPC", async () => {
  const r = {
    ...row,
    status: "scheduled" as const,
    due_at: "2026-11-05T10:00:00Z",
  };
  const f = fixture(r);
  await handleQuickCallback(f.c, callback(r, "repeat"), 42);
  expect(f.rpcCalls).toHaveLength(0);
  expect(f.apiCalls[0].text).toContain("Выбери повтор");
  await handleQuickCallback(f.c, callback(r, "rweekdays"), 42);
  expect(f.rpcCalls[0].p_kind).toBe("weekdays");
});
test("recurring draft custom time respects its named weekday", async () => {
  const f = fixture(
    { ...row, proposed_repeat: { kind: "weekly", weekday: 3 } },
    { reminder_id: row.id, revision: 0, expires_at: "2026-11-04T12:00:00Z" }
  );
  await consumeTimeReply(f.c, 7, "в 10:00");
  expect(f.rpcCalls[0].p_due_at).toBe("2026-11-04T07:00:00.000Z");
});
