import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  verifyGoogleAccount,
  fetchGoogleEvents,
  normalizeGoogleEvents,
  SyncError,
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
    return json({ error: "method_not_allowed" }, 405);
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token || token.length > 8192)
    return json({ error: "google_authorization_required" }, 401);
  let lease: string | null = null,
    ownerId: string | null = null;
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    ownerEmail = Deno.env.get("PLANNER_USER_EMAIL");
  if (!url || !key || !ownerEmail)
    return json({ error: "sync_configuration_missing" }, 503);
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    await verifyGoogleAccount(token);
    const { data: users, error: usersError } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw usersError;
    ownerId =
      users.users.find(
        (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase()
      )?.id ?? null;
    if (!ownerId) return json({ error: "planner_owner_missing" }, 503);
    const { data: claim, error: claimError } = await db.rpc(
      "acquire_google_calendar_sync",
      { p_user_id: ownerId }
    );
    if (claimError) throw claimError;
    lease = claim;
    if (!lease)
      return json({ ok: true, skipped: "sync_already_running_or_recent" });
    const now = Date.now();
    const from = new Date(now - 7 * 86400000).toISOString(),
      to = new Date(now + 180 * 86400000).toISOString();
    const events = normalizeGoogleEvents(
      await fetchGoogleEvents(token, from, to),
      from,
      to
    );
    const { data: result, error: applyError } = await db.rpc(
      "apply_google_calendar_snapshot",
      {
        p_user_id: ownerId,
        p_lease_id: lease,
        p_window_start: from,
        p_window_end: to,
        p_events: events,
      }
    );
    if (applyError) throw applyError;
    return json({ ok: true, ...result });
  } catch (error) {
    const code = error instanceof SyncError ? error.code : "google_sync_failed";
    if (lease && ownerId)
      await db
        .from("google_calendar_sync_state")
        .update({ lease_id: null, lease_until: null, last_error_code: code })
        .eq("user_id", ownerId)
        .eq("lease_id", lease);
    // Never log OAuth tokens, Google responses or private calendar contents.
    console.error(code);
    return json(
      { error: code },
      error instanceof SyncError ? error.status : 500
    );
  }
});
