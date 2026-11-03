import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { sendReminder, type Delivery } from "../telegram-reminders/core.ts";
import {
  manageButtons,
  quickCard,
  type QuickReminder,
} from "../_shared/quick-reminders.ts";
import { telegramApi } from "../_shared/telegram-api.ts";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("TELEGRAM_REMINDER_SECRET");
  if (!secret || request.headers.get("x-reminder-secret") !== secret)
    return json({ error: "Unauthorized" }, 401);
  try {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_ALLOWED_CHAT_ID");
    const email = Deno.env.get("PLANNER_USER_EMAIL");
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || !chatId || !email || !url || !key)
      return json({ error: "Configuration missing" }, 503);
    const body = await request.json().catch(() => ({}));
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const api = telegramApi(token);
    if (body.configure_webhook === true) {
      const info = await api.call("getWebhookInfo", {});
      const expected = `${url}/functions/v1/telegram-webhook`;
      if (info.url !== expected)
        return json(
          { error: "Unexpected webhook URL; configuration unchanged" },
          409
        );
      const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
      if (!webhookSecret) return json({ error: "Webhook secret missing" }, 503);
      await api.call("setWebhook", {
        url: expected,
        secret_token: webhookSecret,
        allowed_updates: [
          ...new Set([
            ...(Array.isArray(info.allowed_updates)
              ? info.allowed_updates
              : []),
            "message",
            "callback_query",
          ]),
        ],
      });
      return json({ ok: true, callbacks_enabled: true });
    }
    const { data: users, error: usersError } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw usersError;
    const owner = users.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (!owner) return json({ error: "Planner owner missing" }, 503);
    if (body.dry_run === true) {
      const { count, error } = await db
        .from("telegram_quick_reminders")
        .select("*", { head: true, count: "exact" })
        .eq("user_id", owner.id)
        .eq("chat_id", chatId)
        .in("status", ["scheduled", "failed"])
        .lte("due_at", new Date().toISOString());
      if (error) throw error;
      return json({ ok: true, dry_run: true, due: count });
    }
    const { error: staleError } = await db
      .from("telegram_quick_reminders")
      .update({ status: "uncertain", error_code: "worker_interrupted" })
      .eq("user_id", owner.id)
      .eq("chat_id", chatId)
      .eq("status", "sending")
      .lt("claimed_at", new Date(Date.now() - 10 * 60000).toISOString());
    if (staleError) throw staleError;
    const { data: claims, error } = await db.rpc(
      "claim_telegram_quick_reminders",
      { p_user_id: owner.id, p_chat_id: chatId }
    );
    if (error) throw error;
    const counts = { sent: 0, failed: 0, uncertain: 0, skipped: 0 };
    for (const claim of claims as QuickReminder[]) {
      // Recheck ownership, revision and claimed state immediately before delivery.
      const { data: current, error: lookupError } = await db
        .from("telegram_quick_reminders")
        .select("*")
        .eq("id", claim.id)
        .eq("user_id", owner.id)
        .eq("chat_id", chatId)
        .eq("revision", claim.revision)
        .eq("status", "sending")
        .maybeSingle();
      let delivery: Delivery;
      if (lookupError)
        delivery = {
          status: "failed",
          error_code: "reminder_lookup_failed",
          next_attempt_at: new Date(Date.now() + 60000).toISOString(),
        };
      else if (!current) {
        counts.skipped++;
        continue;
      } else {
        const deliveredCard = { ...current, status: "sent" } as QuickReminder;
        delivery = await sendReminder(
          token,
          chatId,
          quickCard(deliveredCard),
          fetch,
          manageButtons(deliveredCard)
        );
      }
      const { status, ...details } = delivery;
      const { error: saveError } = await db
        .from("telegram_quick_reminders")
        .update({
          ...details,
          status: status === "skipped" ? "failed" : status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", claim.id)
        .eq("revision", claim.revision)
        .eq("status", "sending");
      if (saveError) throw saveError;
      counts[status]++;
    }
    return json({ ok: true, claimed: claims.length, ...counts });
  } catch {
    console.error("Telegram quick reminder worker failed");
    return json({ error: "Quick reminder worker failed" }, 500);
  }
});
