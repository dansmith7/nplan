import { test, expect } from "bun:test";
import { reminderStartAt } from "../src/lib/planner-calendar-reminders";
test("a title-only edit preserves seconds so it does not reschedule or deliver twice", () => {
  const original = "2026-11-03T16:30:52.321Z";
  expect(
    reminderStartAt(new Date("2026-11-03T16:30:00Z"), original).toISOString()
  ).toBe(original);
});
test("changing the minute or calendar day uses the selected new time", () => {
  const original = "2026-11-03T16:30:52.321Z";
  expect(
    reminderStartAt(new Date("2026-11-03T16:45:00Z"), original).toISOString()
  ).toBe("2026-11-03T16:45:00.000Z");
  expect(
    reminderStartAt(new Date("2026-11-04T16:30:00Z"), original).toISOString()
  ).toBe("2026-11-04T16:30:00.000Z");
});
