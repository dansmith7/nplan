import {
  localParts,
  parseReminderTime,
  wallTime,
  type ParsedTime,
} from "./quick-reminders.ts";
export type RepeatProposal = {
  kind: "daily" | "weekdays" | "weekly" | "monthly";
  weekday?: number;
  monthday?: number;
};
export type ReminderInput = ParsedTime & { repeat: RepeatProposal | null };
const dayNumber = (text: string) =>
  text.startsWith("понедель")
    ? 1
    : text.startsWith("втор")
      ? 2
      : text.startsWith("сред")
        ? 3
        : text.startsWith("четвер")
          ? 4
          : text.startsWith("пятни")
            ? 5
            : text.startsWith("суббот")
              ? 6
              : 7;
export function parseReminderInput(
  text: string,
  timezone: string,
  now = new Date(),
  inherited?: RepeatProposal | null
): ReminderInput {
  const original = text.trim();
  const lower = original.toLowerCase().replaceAll("ё", "е");
  let proposal: RepeatProposal | null = inherited ?? null;
  let span: RegExpMatchArray | null = null;
  if ((span = lower.match(/по\s+будням|каждый\s+будний\s+день/u)))
    proposal = { kind: "weekdays" };
  else if ((span = lower.match(/каждый\s+день|ежедневно/u)))
    proposal = { kind: "daily" };
  else if (
    (span = lower.match(
      /(?:кажд(?:ый|ую|ое)|по)\s+(понедельник(?:ам)?|вторник(?:ам)?|сред(?:у|ам)|четверг(?:ам)?|пятниц(?:у|ам)|суббот(?:у|ам)|воскресень(?:е|ям))(?![\p{L}])/u
    ))
  )
    proposal = { kind: "weekly", weekday: dayNumber(span[1]) };
  else if (
    (span = lower.match(
      /(?:каждого|каждое|каждый)\s+(\d{1,2})(?:[-‑ ]?(?:го|е|й))?\s*(?:числа|число)?(?!\d)/u
    ))
  )
    proposal = { kind: "monthly", monthday: +span[1] };
  else if (
    (span = lower.match(/(\d{1,2})(?:[-‑ ]?го)?\s+числа\s+каждого\s+месяца/u))
  )
    proposal = { kind: "monthly", monthday: +span[1] };
  else if ((span = lower.match(/еженедельно|каждую\s+неделю/u)))
    proposal = { kind: "weekly" };
  else if ((span = lower.match(/ежемесячно|каждый\s+месяц/u)))
    proposal = { kind: "monthly" };
  if (!proposal)
    return { ...parseReminderTime(original, timezone, now), repeat: null };
  const rest = span
    ? original.slice(0, span.index) +
      " " +
      original.slice((span.index ?? 0) + span[0].length)
    : original;
  const parsed = parseReminderTime(rest, timezone, now);
  if (
    (proposal.monthday !== undefined &&
      (proposal.monthday < 1 || proposal.monthday > 31)) ||
    /кажд[а-яё]*|ежедневно|еженедельно|ежемесячно|по будням/iu.test(rest)
  )
    return { ...parsed, dueAt: null, issue: "unsupported", repeat: proposal };
  if (!parsed.dueAt) return { ...parsed, repeat: proposal };
  const current = localParts(now, timezone);
  const base = localParts(new Date(parsed.dueAt), timezone);
  const explicitDate =
    /сегодня|завтра|послезавтра|\d{1,2}[./]\d{1,2}|\d{4}-\d{2}-\d{2}|понедельник|вторник|сред[уа]|четверг|пятниц|суббот|воскресень/iu.test(
      rest
    );
  const start = explicitDate ? base : current;
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  if (proposal.kind === "weekly" && proposal.weekday === undefined) {
    const d = new Date(
      Date.UTC(start.year, start.month - 1, start.day)
    ).getUTCDay();
    proposal = { ...proposal, weekday: d === 0 ? 7 : d };
  }
  if (proposal.kind === "monthly" && proposal.monthday === undefined)
    proposal = { ...proposal, monthday: start.day };
  for (let offset = 0; offset <= 400; offset++) {
    const d = new Date(startUtc + offset * 86400000);
    const dow = d.getUTCDay() || 7;
    if (proposal.kind === "weekdays" && dow > 5) continue;
    if (proposal.kind === "weekly" && dow !== proposal.weekday) continue;
    if (proposal.kind === "monthly") {
      const last = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
      ).getUTCDate();
      if (d.getUTCDate() !== Math.min(proposal.monthday!, last)) continue;
    }
    const candidate = wallTime(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      base.hour,
      base.minute,
      timezone
    );
    if (candidate && candidate > now)
      return { ...parsed, dueAt: candidate.toISOString(), repeat: proposal };
  }
  return { ...parsed, dueAt: null, issue: "invalid", repeat: proposal };
}
