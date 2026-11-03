import { deliverCalendarChanges } from "./changes.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  isCurrentEvent,
  reminderText,
  sendReminder,
  type Event,
  type Reminder,
  type Delivery,
} from "./core.ts";

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
      return json({ error: "Reminder configuration missing" }, 503);
    const body = await request.json().catch(() => ({}));
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: users, error: usersError } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw usersError;
    const owner = users.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (!owner) return json({ error: "Planner owner missing" }, 503);
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("timezone")
      .eq("id", owner.id)
      .single();
    if (profileError) throw profileError;
    const timezone = profile.timezone || "Europe/Istanbul";
    // Validate before claiming; no credentials, event titles or recipient IDs in logs.
    new Intl.DateTimeFormat("ru-RU", { timeZone: timezone }).format();
    if (body.dry_run === true) {
      const { data, error } = await db.rpc("due_telegram_event_reminders", {
        p_user_id: owner.id,
      });
      if (error) throw error;
      return json({
        ok: true,
        dry_run: true,
        due: data.length,
        offsets: [60, 30, 10],
        timezone,
      });
    }
    // Never reclaim an ambiguous in-flight delivery after a crashed invocation.
    const { error: staleError } = await db
      .from("telegram_event_reminders")
      .update({ status: "uncertain", error_code: "worker_interrupted" })
      .eq("user_id", owner.id)
      .eq("status", "sending")
      .lt("claimed_at", new Date(Date.now() - 10 * 60_000).toISOString());
    if (staleError) throw staleError;
    const { data: claims, error } = await db.rpc(
      "claim_telegram_event_reminders",
      { p_user_id: owner.id }
    );
    if (error) throw error;
    const counts = { sent: 0, failed: 0, uncertain: 0, skipped: 0 };
    for (const reminder of claims as Reminder[]) {
      let delivery: Delivery;
      const { data: event, error: eventError } = await db
        .from("calendar_events")
        .select(
          "title,kind,starts_at,student:students(name),notes:lesson_notes(status)"
        )
        .eq("id", reminder.event_id)
        .eq("user_id", owner.id)
        .maybeSingle<Event>();
      if (eventError) {
        delivery = {
          status: "failed",
          error_code: "event_lookup_failed",
          next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        };
      } else if (!isCurrentEvent(event, reminder, new Date())) {
        delivery = {
          status: "skipped",
          error_code: "event_changed_or_cancelled",
        };
      } else {
        delivery = await sendReminder(
          token,
          chatId,
          reminderText(event!, timezone, new Date())
        );
      }
      const { error: saveError } = await db
        .from("telegram_event_reminders")
        .update(delivery)
        .eq("id", reminder.id)
        .eq("status", "sending");
      if (saveError) throw saveError; // do not resend if Telegram succeeded but persistence failed
      counts[delivery.status]++;
    }
    const changes = await deliverCalendarChanges(
      db,
      token,
      chatId,
      owner.id,
      timezone
    );
    return json({ ok: true, claimed: claims.length, ...counts, changes });
  } catch {
    console.error("Telegram reminder worker failed");
    return json({ error: "Reminder worker failed" }, 500);
  }
});
