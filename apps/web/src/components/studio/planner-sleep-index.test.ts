import { describe, expect, it } from "vitest";
import type { PlannerSleepEntry } from "@/hooks/use-planner-sleep-entries";
import { sleepIndex, sleepIndexBreakdown } from "./planner-sleep-index";

const night = (date: string, bedtime: string, wakeTime: string, dayReport?: PlannerSleepEntry["dayReport"]): PlannerSleepEntry => ({
  id: date, date, bedtime, wakeTime, awakenings: 2, dayReport,
});

describe("sleep index", () => {
  it("keeps a historical score stable when later nights are added", () => {
    const older = night("2025-04-11", "01:00", "09:00");
    const target = night("2025-04-13", "03:00", "12:00");
    const later = night("2025-04-16", "00:30", "07:30");
    expect(sleepIndex(target, [older, target, later])).toBe(sleepIndex(target, [older, target]));
  });

  it("gives duration priority and exposes the day adjustment", () => {
    const previous = night("2025-04-12", "01:15", "09:15");
    const weekend = night("2025-04-13", "03:00", "12:00", { energy: 8, sleepiness: 2, clarity: 8, mood: 8 });
    const weekday = night("2025-04-16", "01:30", "08:15");
    const history = [previous, weekend, weekday];
    const longSleep = sleepIndexBreakdown(weekend, history);
    const shorterSleep = sleepIndexBreakdown(weekday, history);
    expect(longSleep.minutes).toBe(540);
    expect(shorterSleep.minutes).toBe(405);
    expect(longSleep.daytime).toBe(83);
    expect(shorterSleep.daytime).toBeNull();
    expect(longSleep.total).toBeGreaterThan(shorterSleep.total);
  });

  it("does not rate a sub-six-hour night as a strong night", () => {
    const shortSleep = night("2025-04-16", "02:00", "07:55");
    expect(sleepIndex(shortSleep, [shortSleep])).toBeLessThan(80);
  });
});
