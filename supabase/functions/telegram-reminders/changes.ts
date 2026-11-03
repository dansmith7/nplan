import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { sendReminder } from "./core.ts";
export type CalendarChange = {
  id: string;
  source_id: string;
  revision: number;
  kind: "moved" | "cancelled";
  title: string;
  before_start: string;
  before_end: string | null;
  after_start: string | null;
  after_end: string | null;
  attempts: number;
  status: string;
};
export function calendarChangeText(change: CalendarChange, timezone: string) {
  const fmt = (time: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  const moved = change.kind === "moved";
  const endOnly =
    moved &&
    change.after_start !== null &&
    +new Date(change.before_start) === +new Date(change.after_start);
  const range = (start: string, end: string | null) =>
    `${fmt(start)}${endOnly && end ? " — " + new Intl.DateTimeFormat("ru-RU", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(end)) : ""}`;
  return [
    moved ? "↪ Встреча перенесена" : "✕ Встреча отменена",
    change.title.slice(0, 500),
    moved
      ? `Было: ${range(change.before_start, change.before_end)}`
      : `Была запланирована: ${fmt(change.before_start)}`,
    moved && change.after_start
      ? `Стало: ${range(change.after_start, change.after_end)}`
      : null,
    `Из календаря Алисы · ${timezone}`,
    "https://nplan-tau.vercel.app/app",
  ]
    .filter(Boolean)
    .join("\n");
}
export async function deliverCalendarChanges(
  db: SupabaseClient,
  token: string,
  chatId: string,
  ownerId: string,
  timezone: string,
  request: typeof fetch = fetch
) {
  const { error: staleError } = await db
    .from("telegram_calendar_changes")
    .update({ status: "uncertain", error_code: "worker_interrupted" })
    .eq("user_id", ownerId)
    .eq("status", "sending")
    .lt("claimed_at", new Date(Date.now() - 10 * 60000).toISOString());
  if (staleError) throw staleError;
  const { data, error } = await db.rpc("claim_telegram_calendar_changes", {
    p_user_id: ownerId,
  });
  if (error) throw error;
  const counts = { sent: 0, failed: 0, uncertain: 0, skipped: 0, deferred: 0 };
  for (const claim of data as CalendarChange[]) {
    // Recheck the latest committed Google revision immediately before sending.
    const { data: current, error: lookupError } = await db.rpc(
      "current_telegram_calendar_change",
      { p_user_id: ownerId, p_id: claim.id }
    );
    if (lookupError) {
      const { error: retryError } = await db
        .from("telegram_calendar_changes")
        .update({
          status: "failed",
          error_code: "change_lookup_failed",
          next_attempt_at: new Date(Date.now() + 60000).toISOString(),
        })
        .eq("id", claim.id)
        .eq("user_id", ownerId)
        .eq("status", "sending");
      if (retryError) throw retryError;
      counts.failed++;
      continue;
    }
    const row = current?.[0] as CalendarChange | undefined;
    if (!row || row.status !== "sending") {
      // A new sync may hold its lease right now. No send was attempted, so it is
      // safe to defer; superseded changes are discarded by the next claim.
      const { error: deferError } = await db
        .from("telegram_calendar_changes")
        .update({ status: "pending", attempts: claim.attempts - 1 })
        .eq("id", claim.id)
        .eq("user_id", ownerId)
        .eq("status", "sending");
      if (deferError) throw deferError;
      counts.deferred++;
      continue;
    }
    const delivery = await sendReminder(
      token,
      chatId,
      calendarChangeText(row, timezone),
      request
    );
    const { error: saveError } = await db
      .from("telegram_calendar_changes")
      .update(delivery)
      .eq("id", claim.id)
      .eq("user_id", ownerId)
      .eq("status", "sending");
    if (saveError) throw saveError; // A successful send with failed persistence must not be retried.
    counts[delivery.status]++;
  }
  return { claimed: data.length, ...counts };
}
