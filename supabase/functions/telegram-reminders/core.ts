export type Reminder = {
  id: string;
  event_id: string;
  starts_at: string;
  lead_minutes: number;
};
export type Event = {
  title: string;
  kind: string;
  starts_at: string;
  student: { name: string } | null;
  notes: { status: string } | null;
};
export type Delivery = {
  status: "sent" | "failed" | "uncertain" | "skipped";
  telegram_message_id?: number;
  delivered_at?: string;
  next_attempt_at?: string;
  error_code?: string;
};

export function isCurrentEvent(
  event: Event | null,
  reminder: Reminder,
  now: Date
) {
  return (
    event !== null &&
    ["lesson", "meeting"].includes(event.kind) &&
    new Date(event.starts_at).getTime() ===
      new Date(reminder.starts_at).getTime() &&
    new Date(event.starts_at).getTime() > now.getTime() &&
    (event.kind !== "lesson" ||
      !event.notes ||
      event.notes.status === "scheduled")
  );
}

export function reminderText(event: Event, timezone: string, now: Date) {
  const start = new Date(event.starts_at);
  const minutes = Math.max(
    1,
    Math.round((start.getTime() - now.getTime()) / 60_000)
  );
  const when = minutes === 60 ? "через 1 час" : `через ${minutes} мин.`;
  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(start);
  return [
    `${event.kind === "lesson" ? "Урок" : "Встреча"} ${when}`,
    event.title.slice(0, 500),
    event.kind === "lesson" && event.student
      ? `Ученик: ${event.student.name}`
      : null,
    `Начало: ${time} (${timezone})`,
    "https://nplan-tau.vercel.app/app",
  ]
    .filter(Boolean)
    .join("\n");
}

// A timeout can happen after Telegram accepts the message. Do not blindly retry
// this ambiguous case: Telegram sendMessage has no idempotency key.
export async function sendReminder(
  token: string,
  chatId: string,
  text: string,
  request: typeof fetch = fetch
): Promise<Delivery> {
  let response: Response;
  try {
    response = await request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(12_000),
      }
    );
  } catch {
    return { status: "uncertain", error_code: "telegram_transport_unknown" };
  }
  let body: {
    ok?: boolean;
    result?: { message_id?: number };
    error_code?: number;
    parameters?: { retry_after?: number };
  };
  try {
    body = await response.json();
  } catch {
    return { status: "uncertain", error_code: "telegram_response_unknown" };
  }
  if (response.ok && body.ok && typeof body.result?.message_id === "number") {
    return {
      status: "sent",
      telegram_message_id: body.result.message_id,
      delivered_at: new Date().toISOString(),
    };
  }
  if (body.ok === false) {
    const code = body.error_code ?? response.status;
    const retryable = code === 429 || code >= 500;
    return {
      status: retryable ? "failed" : "skipped",
      error_code: `telegram_${code}`,
      ...(retryable
        ? {
            next_attempt_at: new Date(
              Date.now() +
                Math.max(60, body.parameters?.retry_after ?? 60) * 1000
            ).toISOString(),
          }
        : {}),
    };
  }
  return { status: "uncertain", error_code: "telegram_response_unknown" };
}
