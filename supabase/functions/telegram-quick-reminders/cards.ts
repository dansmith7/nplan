import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import type { TelegramApi } from "../_shared/telegram-api.ts";
import {
  quickCard,
  manageButtons,
  type QuickReminder,
} from "../_shared/quick-reminders.ts";
type CardUpdate = {
  reminder_id: string;
  message_id: number;
  user_id: string;
  revision: number;
  lease_id: string;
  attempts: number;
};
export async function updateReminderCards(
  db: SupabaseClient,
  api: TelegramApi,
  ownerId: string,
  chatId: string
) {
  const { data, error } = await db.rpc("claim_telegram_reminder_card_updates", {
    p_user_id: ownerId,
  });
  if (error) throw error;
  let edited = 0;
  for (const item of data as CardUpdate[]) {
    const { data: row, error: lookupError } = await db
      .from("telegram_quick_reminders")
      .select("*")
      .eq("id", item.reminder_id)
      .eq("user_id", ownerId)
      .eq("chat_id", chatId)
      .maybeSingle<QuickReminder>();
    let success = false;
    if (!lookupError && row) {
      try {
        await api.edit(
          chatId,
          item.message_id,
          quickCard(row),
          manageButtons(row)
        );
        success = true;
        edited++;
      } catch {
        /* Edits are idempotent; retry latest card, never send a new message. */
      }
    }
    if (success || (!lookupError && !row)) {
      const { error: deleted } = await db
        .from("telegram_reminder_card_updates")
        .delete()
        .eq("reminder_id", item.reminder_id)
        .eq("message_id", item.message_id)
        .eq("revision", item.revision)
        .eq("lease_id", item.lease_id);
      if (deleted) throw deleted;
    }
    // A newer revision can arrive while an older card is being edited. Keep its
    // queued work and release only this worker's lease, so the next edit wins.
    const { error: released } = await db
      .from("telegram_reminder_card_updates")
      .update({
        lease_id: null,
        lease_until: null,
        next_attempt_at: new Date(
          Date.now() + (success ? 0 : 60000)
        ).toISOString(),
      })
      .eq("reminder_id", item.reminder_id)
      .eq("message_id", item.message_id)
      .eq("lease_id", item.lease_id);
    if (released) throw released;
  }
  return edited;
}
