export type RepeatRule = {
  kind: "daily" | "weekdays" | "weekly" | "monthly";
  weekday?: number;
  monthday?: number;
};
export function repeatLabel(rule?: RepeatRule | null): string {
  if (!rule) return "Не повторять";
  if (rule.kind === "daily") return "Каждый день";
  if (rule.kind === "weekdays") return "По будням";
  if (rule.kind === "weekly")
    return `Еженедельно${rule.weekday ? " · " + ["пн", "вт", "ср", "чт", "пт", "сб", "вс"][rule.weekday - 1] : ""}`;
  return `Ежемесячно${rule.monthday ? " · " + rule.monthday + "-го числа" : ""}`;
}
export type QuickReminder = {
  id: string;
  user_id: string;
  chat_id: number | string;
  inbox_id: string | null;
  repeat_rule?: RepeatRule | null;
  proposed_repeat?: RepeatRule | null;
  undo_until?: string | null;
  title: string;
  raw_text: string;
  timezone: string;
  proposed_at: string | null;
  due_at: string | null;
  revision: number;
  status:
    | "draft"
    | "scheduled"
    | "sending"
    | "sent"
    | "failed"
    | "uncertain"
    | "done"
    | "cancelled";
};
export type Button = { text: string; callback_data: string };
export type Markup = { inline_keyboard: Button[][] };
export type ParsedTime = {
  title: string;
  dueAt: string | null;
  issue: "missing" | "invalid" | "past" | "unsupported" | null;
};
const word = (s: string) =>
  new RegExp(`(?<![\\p{L}])(?:${s})(?![\\p{L}])`, "iu");
export function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) =>
    Number(parts.find((p) => p.type === name)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
}
export function wallTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date | null {
  if (
    ![year, month, day, hour, minute].every(Number.isInteger) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  )
    return null;
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const valid = new Date(wall);
  if (valid.getUTCMonth() !== month - 1 || valid.getUTCDate() !== day)
    return null;
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), timezone);
    guess += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  const matches = [-3600000, 0, 3600000]
    .map((offset) => new Date(guess + offset))
    .filter((d) => {
      const p = localParts(d, timezone);
      return (
        p.year === year &&
        p.month === month &&
        p.day === day &&
        p.hour === hour &&
        p.minute === minute
      );
    });
  // Do not silently choose either side of an ambiguous/nonexistent DST clock time.
  return matches.length === 1 ? matches[0] : null;
}
function addDays(p: ReturnType<typeof localParts>, days: number) {
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}
export function parseReminderTime(
  text: string,
  timezone: string,
  now = new Date()
): ParsedTime {
  const original = text.trim();
  let title = original
    .split(/\r?\n/)[0]
    .replace(/^напомни(?:ть)?(?:\s+мне)?\s*/iu, "")
    .trim();
  const result = (
    dueAt: Date | null,
    issue: ParsedTime["issue"] = null
  ): ParsedTime => ({
    title: (title || original.split(/\r?\n/)[0] || "Напоминание").slice(0, 500),
    dueAt: dueAt?.toISOString() ?? null,
    issue,
  });
  if (
    word("кажд[а-яё]*|ежедневно|еженедельно|ежемесячно|по будням").test(
      original
    )
  )
    return result(null, "unsupported");
  const t = original.toLowerCase().replaceAll("ё", "е");
  const relative = t.match(
    /через\s+(?:(\d{1,4}(?:[.,]\d+)?)\s*(минут[а-я]*|мин\.?|час[а-я]*|ч\.?|день|дня|дней)|(?<named>полчаса|полтора часа|час|минуту|день))(?![\p{L}])/u
  );
  if (relative) {
    const rest = t.replace(relative[0], "");
    if (
      /\d{1,2}:\d{2}/u.test(rest) ||
      word("сегодня|завтра|послезавтра").test(rest)
    )
      return result(null, "unsupported");
    const minutes = relative.groups?.named
      ? ({ полчаса: 30, "полтора часа": 90, час: 60, минуту: 1, день: 1440 }[
          relative.groups.named
        ] ?? 0)
      : Number(relative[1].replace(",", ".")) *
        (/^ч/u.test(relative[2]) ? 60 : /^д/u.test(relative[2]) ? 1440 : 1);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 525600)
      return result(null, "invalid");
    title = title
      .replace(
        new RegExp(relative[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"),
        ""
      )
      .trim();
    return result(new Date(now.getTime() + minutes * 60000));
  }
  const p = localParts(now, timezone);
  let date = { year: p.year, month: p.month, day: p.day };
  let explicitDay = false;
  let implicitYear = false;
  let weekday = false;
  const consumed: string[] = [];
  const iso = t.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/u);
  const numeric = iso
    ? null
    : t.match(/(?<!\d)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?!\d)/u);
  const relativeDay = t.match(word("послезавтра|завтра|сегодня"));
  const weekdays = [
    "воскресенье",
    "понедельник",
    "вторник",
    "среду",
    "четверг",
    "пятницу",
    "субботу",
  ];
  const week = t.match(
    new RegExp(`(?:^|\\s)(?:во?\\s+)?(${weekdays.join("|")})(?![\\p{L}])`, "u")
  );
  if ([iso || numeric, relativeDay, week].filter(Boolean).length > 1)
    return result(null, "unsupported");
  if (iso) {
    date = { year: +iso[1], month: +iso[2], day: +iso[3] };
    consumed.push(iso[0]);
    explicitDay = true;
  } else if (numeric) {
    date = {
      year: numeric[3] ? +numeric[3] : p.year,
      month: +numeric[2],
      day: +numeric[1],
    };
    implicitYear = !numeric[3];
    consumed.push(numeric[0]);
    explicitDay = true;
  } else if (relativeDay) {
    date = addDays(
      p,
      relativeDay[0] === "послезавтра" ? 2 : relativeDay[0] === "завтра" ? 1 : 0
    );
    consumed.push(relativeDay[0]);
    explicitDay = true;
  } else if (week) {
    const today = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    date = addDays(p, (weekdays.indexOf(week[1]) - today + 7) % 7);
    consumed.push(week[0]);
    weekday = true;
  }
  const times = [...t.matchAll(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/gu)];
  if (times.length > 1) return result(null, "unsupported");
  const clock = times[0];
  const hourOnly = clock
    ? null
    : t.match(
        /(?:^|\s)в\s+(\d{1,2})(?![\d:.])(?:\s+(утра|вечера|дня|ночи|часов|часа|час))?(?![\p{L}])/u
      );
  const period =
    !clock && !hourOnly ? t.match(word("утром|вечером|днем")) : null;
  if (!clock && !hourOnly && !period)
    return result(null, /\d\s*:\s*\d/u.test(t) ? "invalid" : "missing");
  let hour = clock
    ? +clock[1]
    : hourOnly
      ? +hourOnly[1]
      : period?.[0] === "утром"
        ? 9
        : period?.[0] === "днем"
          ? 12
          : 20;
  const minute = clock ? +clock[2] : 0;
  if (hourOnly && ["вечера", "дня"].includes(hourOnly[2]) && hour < 12)
    hour += 12;
  if (hourOnly?.[2] === "ночи" && hour === 12) hour = 0;
  consumed.push(clock?.[0] ?? hourOnly?.[0] ?? period![0]);
  let due = wallTime(date.year, date.month, date.day, hour, minute, timezone);
  if (!due) return result(null, "invalid");
  if (due <= now) {
    if (implicitYear)
      due = wallTime(
        date.year + 1,
        date.month,
        date.day,
        hour,
        minute,
        timezone
      );
    else if (!explicitDay) {
      date = addDays(p, weekday ? 7 : 1);
      due = wallTime(date.year, date.month, date.day, hour, minute, timezone);
    } else return result(null, "past");
  }
  if (!due || due.getTime() - now.getTime() > 366 * 2 * 86400000)
    return result(null, "invalid");
  for (const span of consumed) {
    const escaped = span.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(
      new RegExp(`(?:^|\\s)в\\s+${escaped}|${escaped}`, "iu"),
      " "
    );
  }
  title = title
    .replace(/\s+/g, " ")
    .replace(/^[,\s–—-]+|[,\s–—-]+$/g, "")
    .trim();
  return result(due);
}
export function formatWhen(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function callback(
  r: Pick<QuickReminder, "id" | "revision">,
  action: string
) {
  return `nr:${r.id}:${r.revision}:${action}`;
}
export function readCallback(value: string) {
  const m = value.match(
    /^nr:([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}):(\d{1,9}):(create|pick|15|60|tom9|tonight|custom|cancel|done|back|undo|repeat|rdaily|rweekdays|rweekly|rmonthly|rnone)$/i
  );
  return m
    ? { id: m[1].toLowerCase(), revision: Number(m[2]), action: m[3] }
    : null;
}
const button = (r: QuickReminder, text: string, action: string): Button => ({
  text,
  callback_data: callback(r, action),
});
export function initialButtons(r: QuickReminder): Markup {
  return {
    inline_keyboard: [
      [
        button(
          r,
          r.proposed_at
            ? `⏰ Создать · ${formatWhen(r.proposed_at, r.timezone)}`
            : "⏰ Создать напоминание",
          r.proposed_at ? "create" : r.proposed_repeat ? "custom" : "pick"
        ),
      ],
    ],
  };
}
export function manageButtons(r: QuickReminder): Markup {
  if (["done", "cancelled"].includes(r.status))
    return {
      inline_keyboard:
        r.undo_until && new Date(r.undo_until) > new Date()
          ? [[button(r, "↩ Вернуть", "undo")]]
          : [],
    };
  if (r.status === "draft") return initialButtons(r);
  return {
    inline_keyboard: [
      ...(r.status === "sent" || r.status === "uncertain"
        ? [[button(r, "Через 15 минут", "15"), button(r, "Через час", "60")]]
        : []),
      [button(r, "✓ Готово", "done"), button(r, "Изменить время", "pick")],
      [
        button(r, r.repeat_rule ? "Пропустить этот раз" : "Отменить", "cancel"),
        button(r, "Повтор", "repeat"),
      ],
    ],
  };
}
export function repeatButtons(r: QuickReminder): Markup {
  return {
    inline_keyboard: [
      [button(r, "Каждый день", "rdaily"), button(r, "По будням", "rweekdays")],
      [
        button(r, "Еженедельно", "rweekly"),
        button(r, "Ежемесячно", "rmonthly"),
      ],
      [button(r, "Не повторять дальше", "rnone")],
      [button(r, "Назад", "back")],
    ],
  };
}
export function pickerButtons(r: QuickReminder): Markup {
  return {
    inline_keyboard: [
      [button(r, "Через 15 минут", "15"), button(r, "Через час", "60")],
      [
        button(r, "Сегодня в 20:00", "tonight"),
        button(r, "Завтра в 09:00", "tom9"),
      ],
      [button(r, "Другое время", "custom"), button(r, "Назад", "back")],
    ],
  };
}
export function quickPreset(
  action: string,
  timezone: string,
  now = new Date()
): string | null {
  if (action === "15" || action === "60")
    return new Date(now.getTime() + Number(action) * 60000).toISOString();
  const p = localParts(now, timezone);
  const d = action === "tom9" ? addDays(p, 1) : p;
  const due = wallTime(
    d.year,
    d.month,
    d.day,
    action === "tom9" ? 9 : 20,
    0,
    timezone
  );
  return due && due > now ? due.toISOString() : null;
}
export function quickCard(r: QuickReminder): string {
  const heading =
    r.status === "done"
      ? "✓ Выполнено"
      : r.status === "cancelled"
        ? "Напоминание отменено"
        : r.status === "draft"
          ? "Пока во входящих NPlan"
          : r.status === "sent"
            ? "⏰ Напоминание"
            : r.status === "uncertain"
              ? "Доставка не подтверждена. Можно перенести напоминание."
              : r.status === "failed"
                ? "Не удалось доставить напоминание. Можно изменить время."
                : "✓ Напомню";
  return [
    heading,
    r.title,
    r.repeat_rule ? `↻ ${repeatLabel(r.repeat_rule)}` : null,
    r.repeat_rule && ["done", "cancelled"].includes(r.status)
      ? "Следующие повторы сохранены."
      : null,
    r.undo_until && new Date(r.undo_until) > new Date()
      ? "Можно вернуть в течение 10 минут."
      : null,
    r.due_at ? `${formatWhen(r.due_at, r.timezone)} (${r.timezone})` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
