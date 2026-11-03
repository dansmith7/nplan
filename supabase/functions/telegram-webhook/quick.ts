import { parseReminderInput } from "../_shared/recurring-reminders.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  initialButtons,
  repeatButtons,
  repeatLabel,
  formatWhen,
  manageButtons,
  pickerButtons,
  quickCard,
  quickPreset,
  readCallback,
  parseReminderTime,
  type QuickReminder,
} from "../_shared/quick-reminders.ts";
import { TelegramError, type TelegramApi } from "../_shared/telegram-api.ts";
export type Context = {
  db: SupabaseClient;
  ownerId: string;
  chatId: string;
  timezone: string;
  api: TelegramApi;
  now?: () => Date;
};
const time = (c: Context) => c.now?.() ?? new Date();
async function getReminder(
  c: Context,
  id: string
): Promise<QuickReminder | null> {
  const { data, error } = await c.db
    .from("telegram_quick_reminders")
    .select("*")
    .eq("id", id)
    .eq("user_id", c.ownerId)
    .eq("chat_id", c.chatId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
async function show(
  c: Context,
  messageId: number | null,
  text: string,
  markup: unknown
) {
  if (messageId) {
    try {
      await c.api.edit(c.chatId, messageId, text, markup);
      return;
    } catch {
      /* An old card may no longer be editable. The reminder is already persisted. */
    }
  }
  await c.api.send(c.chatId, text, markup);
}
async function change(
  c: Context,
  r: QuickReminder,
  action: string,
  dueAt: string | null = null
) {
  const { data, error } = await c.db.rpc("change_telegram_quick_reminder", {
    p_user_id: c.ownerId,
    p_id: r.id,
    p_revision: r.revision,
    p_action: action,
    p_due_at: dueAt,
  });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; reminder?: QuickReminder };
}
async function apply(
  c: Context,
  r: QuickReminder,
  dueAt: string | null,
  messageId: number | null,
  action = "schedule"
) {
  const result = await change(c, r, action, dueAt);
  const current = result.reminder ?? r;
  const reason =
    result.reason === "source_processed"
      ? "Эта запись уже разобрана во входящих. Пришли новое сообщение для напоминания."
      : result.reason === "invalid_time"
        ? "Это время уже прошло или не подходит. Выбери новое."
        : result.reason === "busy"
          ? "Напоминание сейчас отправляется. Повтори через несколько секунд."
          : result.reason === "undo_expired"
            ? "Время возврата истекло. Можно создать новое напоминание."
            : result.reason === "stale"
              ? "Напоминание уже изменено. Ниже его текущее состояние."
              : "";
  await show(
    c,
    messageId,
    [reason, quickCard(current)].filter(Boolean).join("\n\n"),
    result.reason === "source_processed"
      ? { inline_keyboard: [] }
      : result.reason === "invalid_time"
        ? pickerButtons(current)
        : manageButtons(current)
  );
}
async function askTime(c: Context, r: QuickReminder) {
  const prompt = await c.api.send(
    c.chatId,
    `Когда напомнить: «${r.title}»?\nОтветь на это сообщение, например: «завтра в 19:30», «через час» или «05.11 в 10:30».\nЧасовой пояс: ${r.timezone}. Для выхода ответь «отмена».`,
    {
      force_reply: true,
      selective: true,
      input_field_placeholder: "Например, завтра в 19:30",
    }
  );
  const { error } = await c.db.from("telegram_reminder_inputs").insert({
    user_id: c.ownerId,
    chat_id: c.chatId,
    prompt_message_id: prompt,
    reminder_id: r.id,
    revision: r.revision,
  });
  if (error) throw error;
}
export async function handleQuickCallback(
  c: Context,
  data: string,
  messageId: number
): Promise<void> {
  const command = readCallback(data);
  if (!command) return;
  const r = await getReminder(c, command.id);
  if (!r) {
    await c.api.send(
      c.chatId,
      "Напоминание не найдено. Пришли его текст новым сообщением."
    );
    return;
  }
  if (
    r.revision !== command.revision ||
    (["done", "cancelled"].includes(r.status) && command.action !== "undo")
  ) {
    await show(c, messageId, quickCard(r), manageButtons(r));
    return;
  }
  if (r.status === "sending") {
    await c.api.send(
      c.chatId,
      "Напоминание сейчас отправляется. Повтори через несколько секунд."
    );
    return;
  }
  if (command.action === "undo") {
    await apply(c, r, null, messageId, "undo");
    return;
  }
  if (command.action === "repeat") {
    await show(
      c,
      messageId,
      `${quickCard(r)}\n\nВыбери повтор. Время берётся из этой записи. Изменение затронет следующие даты.`,
      repeatButtons(r)
    );
    return;
  }
  if (
    ["rdaily", "rweekdays", "rweekly", "rmonthly", "rnone"].includes(
      command.action
    )
  ) {
    const { data, error } = await c.db.rpc("set_telegram_reminder_repeat", {
      p_user_id: c.ownerId,
      p_id: r.id,
      p_revision: r.revision,
      p_kind: command.action.slice(1),
    });
    if (error) throw error;
    const current = data.reminder ?? r;
    await show(
      c,
      messageId,
      `${data.ok ? "" : "Напоминание изменилось или отправляется. Повтори ещё раз.\n\n"}${quickCard(current)}`,
      manageButtons(current)
    );
    return;
  }
  if (command.action === "pick") {
    await show(
      c,
      messageId,
      `Когда напомнить?\n${r.title}\nЧасовой пояс: ${r.timezone}`,
      pickerButtons(r)
    );
    return;
  }
  if (command.action === "back") {
    await show(c, messageId, quickCard(r), manageButtons(r));
    return;
  }
  if (command.action === "custom") {
    await askTime(c, r);
    return;
  }
  if (command.action === "cancel" || command.action === "done") {
    await apply(c, r, null, messageId, command.action);
    return;
  }
  const dueAt =
    command.action === "create"
      ? r.proposed_at
      : quickPreset(command.action, r.timezone, time(c));
  await apply(c, r, dueAt, messageId);
}
export async function consumeTimeReply(
  c: Context,
  replyId: number | undefined,
  text: string
): Promise<boolean> {
  if (!replyId) return false;
  const { data: input, error } = await c.db
    .from("telegram_reminder_inputs")
    .select("*")
    .eq("user_id", c.ownerId)
    .eq("chat_id", c.chatId)
    .eq("prompt_message_id", replyId)
    .maybeSingle();
  if (error) throw error;
  if (!input) return false;
  const r = await getReminder(c, input.reminder_id);
  if (/^\/?отмена$|^\/cancel$/iu.test(text.trim())) {
    const { error: cancelled } = await c.db
      .from("telegram_reminder_inputs")
      .update({ expires_at: time(c).toISOString() })
      .eq("user_id", c.ownerId)
      .eq("chat_id", c.chatId)
      .eq("prompt_message_id", replyId);
    if (cancelled) throw cancelled;
    await c.api.send(
      c.chatId,
      "Ввод времени отменён. Само напоминание не изменено."
    );
    return true;
  }
  if (
    !r ||
    r.revision !== input.revision ||
    new Date(input.expires_at) < time(c)
  ) {
    await c.api.send(
      c.chatId,
      "Этот запрос времени устарел. Открой «Изменить время» у напоминания ещё раз."
    );
    return true;
  }
  if (
    r.status === "draft" &&
    r.proposed_repeat &&
    /кажд[а-яё]*|ежедневно|еженедельно|ежемесячно|по будням/iu.test(text)
  ) {
    await c.api.send(
      c.chatId,
      "Повтор уже выбран. Ответь только датой и временем, например «в 19:30». Для другого повтора пришли полную фразу новым сообщением."
    );
    return true;
  }
  const parsed =
    r.status === "draft" && r.proposed_repeat
      ? parseReminderInput(text, r.timezone, time(c), r.proposed_repeat)
      : parseReminderTime(text, r.timezone, time(c));
  if (!parsed.dueAt) {
    await c.api.send(
      c.chatId,
      "Не удалось определить будущее время. Пока ничего не изменено."
    );
    await askTime(c, r);
    return true;
  }
  await apply(c, r, parsed.dueAt, null);
  return true;
}
export async function offerQuickReminder(
  c: Context,
  inboxId: string,
  rawText: string,
  inboxReply: string
) {
  const parsed = parseReminderInput(rawText, c.timezone, time(c));
  const { error: insertError } = await c.db
    .from("telegram_quick_reminders")
    .upsert(
      {
        user_id: c.ownerId,
        inbox_id: inboxId,
        chat_id: c.chatId,
        title: parsed.title,
        raw_text: rawText,
        timezone: c.timezone,
        proposed_at: parsed.dueAt,
        proposed_repeat: parsed.issue === "unsupported" ? null : parsed.repeat,
      },
      { onConflict: "inbox_id", ignoreDuplicates: true }
    );
  if (insertError) throw insertError;
  const { data: r, error } = await c.db
    .from("telegram_quick_reminders")
    .update({ offer_state: "sending" })
    .eq("inbox_id", inboxId)
    .eq("user_id", c.ownerId)
    .eq("offer_state", "pending")
    .eq("status", "draft")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!r) return;
  const note =
    parsed.issue === "unsupported"
      ? "\nНе удалось разобрать повтор. Поддерживаются: каждый день, по будням, еженедельно и ежемесячно."
      : parsed.issue === "past"
        ? "\nУказанное время уже прошло. Выбери другое."
        : parsed.issue === "invalid"
          ? "\nНе удалось разобрать время. Его можно выбрать кнопкой."
          : "";
  try {
    const messageId = await c.api.send(
      c.chatId,
      inboxReply +
        note +
        (r.proposed_repeat ? `\n↻ ${repeatLabel(r.proposed_repeat)}` : "") +
        (r.proposed_at
          ? `\n\nНапомнить: ${formatWhen(r.proposed_at, r.timezone)} (${r.timezone})`
          : ""),
      initialButtons(r)
    );
    const { error: saved } = await c.db
      .from("telegram_quick_reminders")
      .update({ offer_state: "sent", offer_message_id: messageId })
      .eq("id", r.id);
    if (saved) throw saved;
  } catch (error) {
    await c.db
      .from("telegram_quick_reminders")
      .update({
        offer_state:
          error instanceof TelegramError && !error.unknownDelivery
            ? "pending"
            : "uncertain",
      })
      .eq("id", r.id)
      .eq("offer_state", "sending");
    throw error;
  }
}
export async function listQuickReminders(c: Context) {
  const { data, error } = await c.db.rpc("list_telegram_quick_reminders", {
    p_user_id: c.ownerId,
    p_chat_id: c.chatId,
  });
  if (error) throw error;
  if (!data?.length) {
    await c.api.send(
      c.chatId,
      "Активных напоминаний пока нет. Пришли, например: «Завтра в 19:30 оплатить интернет»."
    );
    return;
  }
  const rows = data as QuickReminder[];
  const text = rows
    .map(
      (r, i) =>
        `${i + 1}. ${r.title.slice(0, 120)}${r.repeat_rule ? " · ↻ " + repeatLabel(r.repeat_rule) : ""}\n${r.status === "draft" ? "Ещё во входящих" : r.due_at ? new Intl.DateTimeFormat("ru-RU", { timeZone: r.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(r.due_at)) : r.status}`
    )
    .join("\n\n");
  await c.api.send(
    c.chatId,
    `Последние напоминания и предложения из входящих:\n\n${text}\n\nВыбери запись для управления.`,
    {
      inline_keyboard: rows.map((r, i) => [
        {
          text: `${i + 1}. ${r.title.slice(0, 50)}`,
          callback_data: `nr:${r.id}:${r.revision}:back`,
        },
      ]),
    }
  );
}
