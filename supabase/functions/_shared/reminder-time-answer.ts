/** A bare time answer may continue an open picker; a new task with its own
 * words/time must keep the normal inbox flow. Parsing/validation follows later. */
export function isReminderTimeAnswer(text: string): boolean {
  const value = text
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[.!?]+$/u, "")
    .trim();
  if (/^(?:\/?отмена|\/cancel)$/u.test(value)) return true;
  const date = String.raw`(?:сегодня|завтра|послезавтра|(?:во?\s+)?(?:понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)|\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./]\d{4})?)`;
  const clock = String.raw`(?:(?:в\s+)?\d{1,2}:\d{2}|в\s+\d{1,2}(?:\s+(?:утра|вечера|дня|ночи|часов|часа|час))?|утром|днем|вечером)`;
  if (new RegExp(`^(?:${date}\\s+)?${clock}(?:\\s+${date})?$`, "u").test(value))
    return true;
  return /^через\s+(?:\d{1,4}(?:[.,]\d+)?\s*(?:минут[а-я]*|мин\.?|час[а-я]*|ч\.?|день|дня|дней)|полчаса|полтора часа|час|минуту|день)$/u.test(
    value
  );
}
