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
  const writes: Array<{ table: string; values: Record<string, unknown> }> = [];
  const rpcNames: string[] = [];
  const db = {
    from(table: string) {
      const query = {
        select: () => query,
        update: (values: Record<string, unknown>) => {
          writes.push({ table, values });
          return query;
        },
        upsert: (values: Record<string, unknown>) => {
          writes.push({ table, values });
          return query;
        },
        gt: () => query,
        gte: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve),
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        maybeSingle: async () => ({
          data:
            table === "telegram_reminder_inputs"
              ? input
              : table === "telegram_reminder_time_replies"
                ? null
                : current,
          error: null,
        }),
      };
      return query;
    },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      rpcNames.push(_name);
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
  return { c, rpcCalls, rpcNames, apiCalls, filters, writes };
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

const openInput = {
  reminder_id: row.id,
  prompt_message_id: 42,
  revision: 0,
  accept_unthreaded: true,
  created_at: "2026-11-03T11:59:00Z",
  expires_at: "2026-11-03T12:14:00Z",
};
test("picker opens a recent context that accepts the next time message", async () => {
  const f = fixture();
  await handleQuickCallback(f.c, callback(row, "pick"), 42);
  expect(f.apiCalls[0].text).toContain("следующим сообщением");
  expect(
    f.writes.some(
      (w) =>
        w.table === "telegram_reminder_inputs" &&
        w.values.prompt_message_id === 42 &&
        w.values.accept_unthreaded === true
    )
  ).toBe(true);
});
test("a plain time following the picker schedules the original reminder atomically", async () => {
  const f = fixture({ ...row, title: "взять с собой еду" }, openInput);
  expect(await consumeTimeReply(f.c, undefined, "сегодня в 19:05", 100)).toBe(
    true
  );
  expect(f.rpcNames[0]).toBe("apply_telegram_reminder_time_reply");
  expect(f.rpcCalls[0]).toMatchObject({
    p_message_id: 100,
    p_prompt_message_id: 42,
    p_revision: 0,
    p_due_at: "2026-11-03T16:05:00.000Z",
  });
  expect(f.apiCalls[0].text).toContain("взять с собой еду");
  expect(f.apiCalls[0].method).toBe("edit");
});
test("a new task with a time keeps the inbox flow and closes implicit time input", async () => {
  const f = fixture({ ...row }, openInput);
  expect(
    await consumeTimeReply(f.c, undefined, "купить хлеб завтра в 9:05", 100)
  ).toBe(false);
  expect(f.rpcCalls).toHaveLength(0);
  expect(f.writes.some((w) => w.values.accept_unthreaded === false)).toBe(true);
});
test("a past time stays unscheduled and is consumed instead of becoming an orphan", async () => {
  const f = fixture({ ...row }, openInput);
  expect(await consumeTimeReply(f.c, undefined, "сегодня в 9:05", 100)).toBe(
    true
  );
  expect(f.rpcCalls).toHaveLength(0);
  expect(f.apiCalls[0].text).toContain("будущее время");
});
test("an old or closed picker gives guidance instead of creating an orphan time entry", async () => {
  for (const input of [
    { ...openInput, created_at: "2026-11-03T11:00:00Z" },
    { ...openInput, accept_unthreaded: false },
    { ...openInput, expires_at: "2026-11-03T11:59:00Z" },
  ]) {
    const f = fixture({ ...row }, input);
    expect(await consumeTimeReply(f.c, undefined, "завтра в 9:05", 100)).toBe(
      true
    );
    expect(f.rpcCalls).toHaveLength(0);
  }
});
test("a changed reminder cannot be overwritten by an unthreaded stale reply", async () => {
  const f = fixture({ ...row, revision: 1, status: "scheduled" }, openInput);
  expect(await consumeTimeReply(f.c, undefined, "завтра в 9:05", 100)).toBe(
    true
  );
  expect(f.rpcCalls).toHaveLength(0);
});
test("unrelated explicit replies never borrow the last picker", async () => {
  const f = fixture();
  expect(await consumeTimeReply(f.c, 900, "завтра в 9:05", 100)).toBe(true);
  expect(f.rpcCalls).toHaveLength(0);
  expect(f.filters).toContainEqual(["prompt_message_id", 900]);
});
test("a redelivered time answer is consumed without another confirmation or inbox record", async () => {
  const f = fixture();
  const original = f.c.db.from.bind(f.c.db);
  f.c.db.from = ((table: string) =>
    table === "telegram_reminder_time_replies"
      ? {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: { message_id: 100 }, error: null }),
        }
      : original(table)) as typeof f.c.db.from;
  expect(await consumeTimeReply(f.c, undefined, "сегодня в 19:05", 100)).toBe(
    true
  );
  expect(f.rpcCalls).toHaveLength(0);
  expect(f.apiCalls).toHaveLength(0);
});

test("a bare time with no open question never becomes a standalone inbox item", async () => {
  const f = fixture();
  expect(await consumeTimeReply(f.c, undefined, "завтра в 9:05", 100)).toBe(
    true
  );
  expect(f.rpcCalls).toHaveLength(0);
  expect(f.apiCalls[0].text).toContain("/reminders");
});
