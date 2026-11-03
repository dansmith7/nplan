import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { enrichMovieFromText } from "./kinopoisk.ts";
import { telegramApi } from "../_shared/telegram-api.ts";
import {
  consumeTimeReply,
  handleQuickCallback,
  listQuickReminders,
  offerQuickReminder,
} from "./quick.ts";

type Message = {
  message_id: number;
  text?: string;
  caption?: string;
  chat: { id: number; type: string };
  from?: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  reply_to_message?: { message_id: number };
};
type TelegramUpdate = {
  update_id: number;
  message?: Message;
  callback_query?: {
    id: string;
    from: { id: number };
    message?: Message;
    data?: string;
  };
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (
    !webhookSecret ||
    request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret
  )
    return json({ error: "Unauthorized" }, 401);
  try {
    const update = (await request.json()) as TelegramUpdate;
    const callback = update.callback_query;
    const message = update.message;
    const incoming = callback?.message ?? message;
    const allowedChatId = Deno.env.get("TELEGRAM_ALLOWED_CHAT_ID");
    if (
      !incoming ||
      !allowedChatId ||
      incoming.chat.type !== "private" ||
      String(incoming.chat.id) !== allowedChatId ||
      String(callback?.from.id ?? incoming.from?.id) !== allowedChatId
    )
      return json({ ok: true });
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const email = Deno.env.get("PLANNER_USER_EMAIL");
    if (!token || !url || !key || !email)
      throw new Error("Planner configuration missing");
    const api = telegramApi(token);
    if (callback) await api.answer(callback.id).catch(() => {});
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: users, error: usersError } =
      await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw usersError;
    const owner = users.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (!owner) throw new Error("Planner owner missing");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", owner.id)
      .single();
    if (profileError) throw profileError;
    const timezone = profile.timezone || "Europe/Istanbul";
    new Intl.DateTimeFormat("ru-RU", { timeZone: timezone }).format();
    const context = {
      db: supabase,
      ownerId: owner.id,
      chatId: allowedChatId,
      timezone,
      api,
    };
    if (callback) {
      await handleQuickCallback(
        context,
        callback.data ?? "",
        incoming.message_id
      );
      return json({ ok: true });
    }
    if (!message) return json({ ok: true });
    const text = (message.text ?? message.caption ?? "").trim();
    if (
      await consumeTimeReply(
        context,
        message.reply_to_message?.message_id,
        text
      )
    )
      return json({ ok: true });
    if (/^\/(?:start|help)(?:\s|$)/u.test(text)) {
      await api.send(
        allowedChatId,
        "NPlan подключён. Пришли текст, например: «Завтра в 19:30 оплатить интернет».\nЯ добавлю его во входящие и предложу кнопку «Создать напоминание». Без времени можно выбрать его кнопками.\n/reminders — последние напоминания.\nВремя: " +
          timezone
      );
      return json({ ok: true });
    }
    if (text === "/reminders") {
      await listQuickReminders(context);
      return json({ ok: true });
    }
    if (!text) {
      await api.send(
        allowedChatId,
        "Пока принимаю только текст. Напиши, о чём и когда напомнить."
      );
      return json({ ok: true });
    }
    const firstLine = text.split(/\r?\n/, 1)[0]?.trim() || text;
    const movie = await enrichMovieFromText(text);
    const title = (movie?.title ?? firstLine).slice(0, 500);
    const externalId = `${message.chat.id}:${message.message_id}`;
    const telegramMetadata = {
      telegram_chat_id: message.chat.id,
      telegram_message_id: message.message_id,
      telegram_user_id: message.from?.id ?? null,
      telegram_username: message.from?.username ?? null,
    };
    const { error: insertError } = await supabase.from("inbox_items").upsert(
      {
        user_id: owner.id,
        source: "telegram",
        external_id: externalId,
        title,
        raw_text: text,
        received_at: new Date().toISOString(),
        status: "new",
        metadata: movie
          ? {
              ...telegramMetadata,
              classification: "movie",
              movie,
            }
          : telegramMetadata,
      },
      {
        onConflict: "user_id,source,external_id",
        ignoreDuplicates: true,
      }
    );
    if (insertError) throw insertError;

    const movieDetails = movie
      ? [
          movie.year ? String(movie.year) : null,
          movie.directors.length ? movie.directors.join(", ") : null,
          movie.ratingKinopoisk ? `КП ${movie.ratingKinopoisk}` : null,
          movie.ratingImdb ? `IMDb ${movie.ratingImdb}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

    const { data: inbox, error: lookupError } = await supabase
      .from("inbox_items")
      .select("id,status")
      .eq("user_id", owner.id)
      .eq("source", "telegram")
      .eq("external_id", externalId)
      .single();
    if (lookupError) throw lookupError;
    if (inbox.status === "new")
      await offerQuickReminder(
        context,
        inbox.id,
        text,
        movie
          ? `Добавил фильм во входящие NPlan: «${title}»${movieDetails ? `\n${movieDetails}` : ""}`
          : `Добавил во входящие NPlan: «${title}»`
      );
    return json({ ok: true });
  } catch {
    console.error("Telegram webhook failed");
    return json({ error: "Telegram webhook failed" }, 500);
  }
});
