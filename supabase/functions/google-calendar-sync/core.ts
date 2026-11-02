export const SOURCE_ACCOUNT = "dankuzn2@gmail.com";
export const ORGANIZER = "aseeva.alisa97@gmail.com";
export type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  updated?: string;
  organizer?: { email?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  recurringEventId?: string;
  originalStartTime?: { dateTime?: string; date?: string };
};
export class SyncError extends Error {
  constructor(
    public code: string,
    public status = 502
  ) {
    super(code);
  }
}
export async function verifyGoogleAccount(
  token: string,
  request: typeof fetch = fetch
) {
  const response = await request(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    }
  );
  if (!response.ok) throw new SyncError("google_authorization_required", 401);
  const data = await response.json();
  if (
    data.email?.toLowerCase() !== SOURCE_ACCOUNT ||
    data.verified_email !== true
  )
    throw new SyncError("wrong_google_account", 403);
}
export async function fetchGoogleEvents(
  token: string,
  from: string,
  to: string,
  request: typeof fetch = fetch
): Promise<GoogleEvent[]> {
  const result: GoogleEvent[] = [];
  const seenPages = new Set<string>();
  let page: string | undefined;
  const deadline = Date.now() + 35000;
  do {
    if (Date.now() > deadline || seenPages.size >= 20)
      throw new SyncError("google_snapshot_incomplete");
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(SOURCE_ACCOUNT)}/events`
    );
    const params = {
      timeMin: from,
      timeMax: to,
      singleEvents: "true",
      showDeleted: "false",
      maxResults: "2500",
      fields:
        "nextPageToken,items(id,status,summary,description,location,htmlLink,hangoutLink,updated,organizer(email),attendees(self,responseStatus),start,end,recurringEventId,originalStartTime)",
    };
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    if (page) url.searchParams.set("pageToken", page);
    const response = await request(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok)
      throw new SyncError(
        response.status === 403
          ? "google_calendar_permission_missing"
          : "google_calendar_unavailable",
        response.status === 403 ? 403 : 502
      );
    const body = await response.json();
    if (!body || (body.items !== undefined && !Array.isArray(body.items)))
      throw new SyncError("google_snapshot_invalid");
    result.push(...(body.items ?? []));
    page = body.nextPageToken;
    if (page) {
      if (typeof page !== "string" || seenPages.has(page))
        throw new SyncError("google_snapshot_incomplete");
      seenPages.add(page);
    }
  } while (page);
  return result;
}
const plainText = (text: string) =>
  text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
export function normalizeGoogleEvents(
  events: GoogleEvent[],
  from: string,
  to: string
) {
  const result = new Map<
    string,
    {
      source_id: string;
      google_id: string;
      organizer_email: string;
      title: string;
      description: string;
      starts_at: string;
      ends_at: string;
      source_updated_at: string | null;
    }
  >();
  for (const event of events) {
    if (
      event.organizer?.email?.toLowerCase() !== ORGANIZER ||
      event.status === "cancelled" ||
      event.attendees?.some((a) => a.self && a.responseStatus === "declined") ||
      !event.start?.dateTime ||
      !event.end?.dateTime
    )
      continue;
    const start = new Date(event.start.dateTime),
      end = new Date(event.end.dateTime);
    if (
      !Number.isFinite(+start) ||
      !Number.isFinite(+end) ||
      end <= start ||
      !event.id
    )
      throw new SyncError("google_event_invalid");
    if (+start < +new Date(from) || +start >= +new Date(to)) continue;
    // originalStartTime remains the occurrence identity when just one meeting moves.
    const original = event.originalStartTime?.dateTime;
    const sourceId =
      event.recurringEventId && original
        ? `${event.recurringEventId}@${new Date(original).toISOString()}`
        : event.id;
    const description = [
      plainText(event.description ?? ""),
      event.location ? `Место: ${event.location}` : null,
      event.hangoutLink ? `Видеовстреча: ${event.hangoutLink}` : null,
      `Из Google Календаря · ${ORGANIZER}`,
      event.htmlLink,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 50000);
    if (result.has(sourceId)) throw new SyncError("google_identity_duplicate");
    result.set(sourceId, {
      source_id: sourceId,
      google_id: event.id,
      organizer_email: ORGANIZER,
      title: (event.summary?.trim() || "Встреча").slice(0, 500),
      description,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      source_updated_at: event.updated ?? null,
    });
  }
  if (result.size > 1000) throw new SyncError("google_snapshot_too_large");
  return [...result.values()];
}
