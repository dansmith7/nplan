import { describe, expect, it } from "vitest";
import type { PlannerDailyCard } from "@/hooks/use-planner-daily-card";
import type { PlannerSleepEntry } from "@/hooks/use-planner-sleep-entries";
import {
  buildObservations,
  shiftObservationDay,
  workoutStatus,
} from "./planner-observations";

const today = "2026-10-25";
const night = (
  date: string,
  energy = 6,
  bedtime = "00:00"
): PlannerSleepEntry => ({
  id: date,
  date,
  bedtime,
  wakeTime: "08:00",
  awakenings: 0,
  dayReport: { energy, clarity: energy, mood: 6, sleepiness: 4 },
});
const card = (
  day: string,
  patch: Partial<PlannerDailyCard> = {}
): PlannerDailyCard => ({
  id: day,
  day,
  had_workout: null,
  workout_type: null,
  workout_minutes: null,
  had_sex: null,
  alcohol_units: null,
  cigarettes: null,
  ate_junk_food: null,
  weight_kg: null,
  activity_note: null,
  note: null,
  ...patch,
});
const dates = (n: number) =>
  Array.from({ length: n }, (_, i) => shiftObservationDay(today, i - n));
const item = (
  cards: PlannerDailyCard[],
  sleep: PlannerSleepEntry[],
  id: string
) =>
  buildObservations(cards, sleep, today)
    .flatMap((g) => g.items)
    .find((i) => i.id === id)!;

describe("personal observations", () => {
  it("keeps all six groups honest when no data is available", () => {
    const groups = buildObservations([], [], today);
    expect(groups).toHaveLength(6);
    expect(
      groups.flatMap((g) => g.items).every((i) => i.status === "insufficient")
    ).toBe(true);
  });

  it("does not interpret a missing workout as a rest day", () => {
    const days = dates(10);
    const cards = days.map((d, i) =>
      card(d, { had_workout: i < 5 ? true : null })
    );
    const sleep = days.map((d, i) => night(d, i < 5 ? 8 : 3));
    expect(item(cards, sleep, "training-energy-0").status).toBe("insufficient");
    const recordedRest = cards.map((c, i) =>
      i >= 5 ? { ...c, had_workout: false } : c
    );
    expect(item(recordedRest, sleep, "training-energy-0").status).toBe(
      "signal"
    );
    expect(workoutStatus(card(today, { workout_type: "Бег" }))).toBe(true);
  });

  it("pairs habits with the following night and day, not the preceding night", () => {
    const days = dates(10);
    const cards = days.map((d, i) =>
      card(d, { alcohol_units: i % 2 === 0 ? 1 : 0 })
    );
    const sleep = days.map((d, i) =>
      night(shiftObservationDay(d, 1), i % 2 === 0 ? 8 : 4)
    );
    const observation = item(cards, sleep, "alcohol-energy");
    expect(observation.status).toBe("signal");
    expect(observation.finding).toContain("4,0 п. выше");
    expect(observation.evidence).toContain("5 и 5");
  });

  it("excludes missing alcohol and food answers instead of using them as zero", () => {
    const days = dates(10),
      cards = days.map((d, i) => card(d, { alcohol_units: i < 5 ? 1 : null }));
    const sleep = days.map((d) => night(shiftObservationDay(d, 1)));
    expect(item(cards, sleep, "alcohol-energy").evidence).toContain("5 и 0");
    expect(item(cards, sleep, "food-energy").status).toBe("insufficient");
  });

  it("formats lower values without a contradictory negative sign", () => {
    const days = dates(10),
      cards = days.map((d, i) => card(d, { had_workout: i < 5 }));
    const sleep = days.map((d, i) => night(d, i < 5 ? 3 : 7));
    expect(item(cards, sleep, "training-energy-0").finding).toContain(
      "на 4,0 п. ниже"
    );
  });

  it("does not recommend changes for small differences", () => {
    const days = dates(10),
      cards = days.map((d, i) => card(d, { had_workout: i < 5 }));
    const sleep = days.map((d, i) => night(d, i < 5 ? 6.2 : 6));
    expect(item(cards, sleep, "training-energy-0").status).toBe("neutral");
  });

  it("compares seven days with the preceding, non-overlapping 28 days", () => {
    const sleep = Array.from({ length: 35 }, (_, i) =>
      night(shiftObservationDay(today, i - 34), i < 28 ? 4 : 8)
    );
    const trend = item([], sleep, "trend-energy");
    expect(trend.finding).toContain("4,0 п. выше");
    expect(trend.evidence).toContain("7 записей");
    expect(trend.evidence).toContain("28 записей");
  });

  it("handles bedtimes crossing midnight as a small change", () => {
    const sleep = dates(12).map((d, i) =>
      night(d, 6, i % 2 ? "23:50" : "00:10")
    );
    expect(item([], sleep, "schedule-energy").evidence).toContain("9 и 0");
  });

  it("ignores future entries and stays stable when they are added", () => {
    const sleep = dates(10).map((d) => night(d));
    expect(
      buildObservations([], [...sleep, night("2027-01-01", 10)], today)
    ).toEqual(buildObservations([], sleep, today));
  });
});
