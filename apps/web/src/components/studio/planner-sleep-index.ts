import type { PlannerSleepEntry, SleepReport } from "@/hooks/use-planner-sleep-entries";

function duration(bedtime: string, wakeTime: string) {
  const [bh = 0, bm = 0] = bedtime.split(":").map(Number);
  const [wh = 0, wm = 0] = wakeTime.split(":").map(Number);
  const start = bh * 60 + bm;
  let end = wh * 60 + wm;
  if (end <= start) end += 1440;
  return end - start;
}

function timingMinutes(entry: PlannerSleepEntry) {
  const [hours = 0, minutes = 0] = entry.bedtime.split(":").map(Number);
  const value = hours * 60 + minutes;
  return value < 12 * 60 ? value + 1440 : value;
}

function sleepDurationScore(minutes: number) {
  if (minutes >= 450) return 100;
  if (minutes >= 420) return Math.round(80 + ((minutes - 420) / 30) * 20);
  if (minutes >= 360) return Math.round(60 + ((minutes - 360) / 60) * 20);
  if (minutes >= 300) return Math.round(35 + ((minutes - 300) / 60) * 25);
  if (minutes >= 240) return Math.round(10 + ((minutes - 240) / 60) * 25);
  return 0;
}

function awakeningScore(awakenings: number) {
  if (awakenings === 0) return 100;
  if (awakenings === 1) return 90;
  if (awakenings === 2) return 85;
  if (awakenings === 3) return 60;
  return Math.max(20, 60 - (awakenings - 3) * 10);
}

function weekdayLateBedtimePenalty(entry: PlannerSleepEntry) {
  const wakeDay = new Date(`${entry.date}T12:00:00`).getDay();
  if (wakeDay === 0 || wakeDay === 6) return 0;
  const bedtime = timingMinutes(entry);
  if (bedtime <= 26 * 60) return 0;
  if (bedtime <= 26 * 60 + 30) return 5;
  if (bedtime <= 27 * 60) return 12;
  if (bedtime <= 28 * 60) return 22;
  return 30;
}

export function sleepIndexBreakdown(entry: PlannerSleepEntry, history: PlannerSleepEntry[]) {
  const minutes = duration(entry.bedtime, entry.wakeTime);
  const durationScore = sleepDurationScore(minutes);
  // A night's score must not change because a later night was added.
  const others = history.filter((item) => item.date < entry.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const averageTiming = others.length
    ? others.reduce((sum, item) => sum + timingMinutes(item), 0) / others.length
    : timingMinutes(entry);
  const timingDifference = others.length ? Math.round(Math.abs(timingMinutes(entry) - averageTiming)) : null;
  const timingScore = timingDifference === null ? 100 : Math.max(0, Math.round(100 - timingDifference / 1.2));
  const awakenings = awakeningScore(entry.awakenings);
  const latePenalty = weekdayLateBedtimePenalty(entry);
  // Duration is the primary signal; a shifted weekend schedule should not
  // outweigh a long night. The day report is a small adjustment when present.
  const nightly = Math.max(0, Math.round(durationScore * 0.7 + timingScore * 0.15 + awakenings * 0.15 - latePenalty));
  const daytime = entry.dayReport ? dayScore(entry.dayReport) : null;
  const total = daytime === null ? nightly : Math.round(nightly * 0.85 + daytime * 0.15);
  return { total, nightly, daytime, minutes, durationScore, timingScore, timingDifference, awakeningScore: awakenings, latePenalty };
}

export function nightIndex(entry: PlannerSleepEntry, history: PlannerSleepEntry[]) {
  return sleepIndexBreakdown(entry, history).nightly;
}

export function dayScore(report: SleepReport) {
  return Math.round((report.energy + (11 - report.sleepiness) + report.clarity + report.mood) * 2.5);
}

export function sleepIndex(entry: PlannerSleepEntry, history: PlannerSleepEntry[]) {
  return sleepIndexBreakdown(entry, history).total;
}
