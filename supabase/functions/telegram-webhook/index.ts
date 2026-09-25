import { createClient } from "npm:@supabase/supabase-js@2";

type TelegramUpdate = {
  update_id: number;
  message?: {
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
  };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

async function sendTelegramMessage(chatId: number, text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with ${response.status}`);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const receivedSecret = request.headers.get(
    "x-telegram-bot-api-secret-token"
  );
  if (!webhookSecret || receivedSecret !== webhookSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  if (!message) return json({ ok: true });

  const allowedChatId = Deno.env.get("TELEGRAM_ALLOWED_CHAT_ID");
  if (!allowedChatId || String(message.chat.id) !== allowedChatId) {
    return json({ ok: true });
  }

  const text = (message.text ?? message.caption ?? "").trim();
  if (text === "/start" || text.startsWith("/start ")) {
    await sendTelegramMessage(
      message.chat.id,
      "NPlan подключён. Пришли задачу обычным сообщением — я добавлю её во входящие планнера."
    );
    return json({ ok: true });
  }

  if (!text) {
    await sendTelegramMessage(
      message.chat.id,
      "Пока я принимаю только текстовые задачи. Голосовые добавим следующим шагом."
    );
    return json({ ok: true });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const plannerUserEmail = Deno.env.get("PLANNER_USER_EMAIL");
  if (!supabaseUrl || !serviceRoleKey || !plannerUserEmail) {
    throw new Error("Supabase planner environment is not configured");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authUser, error: authError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) throw authError;

  const owner = authUser.users.find(
    (user) => user.email?.toLowerCase() === plannerUserEmail.toLowerCase()
  );
  if (!owner) throw new Error("Planner owner was not found");

  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() || text;
  const title = firstLine.slice(0, 500);
  const externalId = `${message.chat.id}:${message.message_id}`;
  const { error: insertError } = await supabase.from("inbox_items").upsert(
    {
      user_id: owner.id,
      source: "telegram",
      external_id: externalId,
      title,
      raw_text: text,
      received_at: new Date().toISOString(),
      status: "new",
      metadata: {
        telegram_chat_id: message.chat.id,
        telegram_message_id: message.message_id,
        telegram_user_id: message.from?.id ?? null,
        telegram_username: message.from?.username ?? null,
      },
    },
    {
      onConflict: "user_id,source,external_id",
      ignoreDuplicates: true,
    }
  );
  if (insertError) throw insertError;

  await sendTelegramMessage(
    message.chat.id,
    `Добавил во входящие NPlan: «${title}»`
  );
  return json({ ok: true });
});
