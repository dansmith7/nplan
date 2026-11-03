import { test, expect } from "bun:test";
import { parseReminderInput as parse } from "./recurring-reminders";
import {
  callback,
  readCallback,
  manageButtons,
  type QuickReminder,
} from "./quick-reminders";
const tz = "Europe/Istanbul";
const now = new Date("2026-11-03T12:00:00Z");
test("daily moves to tomorrow after the local clock, strips repeat from title", () => {
  const r = parse("Напомни каждый день в 10:00 выпить витамины", tz, now);
  expect(r.dueAt).toBe("2026-11-04T07:00:00.000Z");
  expect(r.title).toBe("выпить витамины");
  expect(r.repeat?.kind).toBe("daily");
});
test("weekday schedule skips a weekend", () => {
  expect(
    parse("по будням в 10:00 зарядка", tz, new Date("2026-11-06T12:00:00Z"))
      .dueAt
  ).toBe("2026-11-09T07:00:00.000Z");
});
test("weekly named day is kept even when the current clock has passed", () => {
  const r = parse("каждую среду в 10:00 урок", tz, now);
  expect(r.dueAt).toBe("2026-11-04T07:00:00.000Z");
  expect(r.repeat?.weekday).toBe(3);
});
test("monthly 31st clamps to February but preserves the intended monthday", () => {
  const r = parse(
    "каждого 31-го числа в 10:00 платёж",
    tz,
    new Date("2027-02-01T12:00:00Z")
  );
  expect(r.dueAt).toBe("2027-02-28T07:00:00.000Z");
  expect(r.repeat?.monthday).toBe(31);
  expect(
    parse(
      "каждое 31 число в 10:00 платёж",
      tz,
      new Date("2028-02-01T12:00:00Z")
    ).dueAt
  ).toBe("2028-02-29T07:00:00.000Z");
});
test("missing time keeps repeat proposal for custom reply", () => {
  const r = parse("каждую среду урок", tz, now);
  expect(r.dueAt).toBeNull();
  expect(r.repeat?.weekday).toBe(3);
  expect(parse("в 10:00", tz, now, r.repeat).dueAt).toBe(
    "2026-11-04T07:00:00.000Z"
  );
});
test("invalid recurrence and clock never silently schedule", () => {
  expect(parse("каждого 32-го числа в 10:00", tz, now).dueAt).toBeNull();
  expect(parse("каждый день в 25:00", tz, now).dueAt).toBeNull();
  expect(parse("каждые 2 недели в 10:00", tz, now).dueAt).toBeNull();
});
test("one-shot and explicit first date still work", () => {
  expect(parse("через час позвонить", tz, now).repeat).toBeNull();
  expect(parse("еженедельно завтра в 19:30 урок", tz, now).dueAt).toBe(
    "2026-11-04T16:30:00.000Z"
  );
});
test("repeat callbacks fit Telegram limit and undo requires a live window", () => {
  const r = {
    id: "24faf5c3-16df-4ba7-8045-72732ef631da",
    revision: 999999999,
    status: "done",
    undo_until: new Date(Date.now() + 60000).toISOString(),
  } as QuickReminder;
  for (const action of [
    "undo",
    "repeat",
    "rdaily",
    "rweekdays",
    "rmonthly",
    "rweekly",
    "rnone",
  ]) {
    const data = callback(r, action);
    expect(data.length).toBeLessThanOrEqual(64);
    expect(readCallback(data)?.action).toBe(action);
  }
  expect(manageButtons(r).inline_keyboard[0][0].text).toContain("Вернуть");
  expect(
    manageButtons({ ...r, undo_until: "2000-01-01" }).inline_keyboard
  ).toEqual([]);
});
