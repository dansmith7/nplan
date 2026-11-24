import type { PlannerSleepEntry, SleepReport } from "@/hooks/use-planner-sleep-entries";

const dayMinutes = 1440;
const durationScale = [[180, 0], [240, 15], [300, 30], [360, 45], [390, 65], [420, 80], [450, 95], [480, 100]] as const;
const awakeningScale = [20, 20, 20, 12, 8] as const;
const shortNightMinutes = 420;
export const sleepIndexWeights = { duration: 70, awakenings: 20, timing: 10 } as const;

function clockMinutes(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function sleepDurationMinutes(bedtime: string, wakeTime: string) {
  return (clockMinutes(wakeTime) - clockMinutes(bedtime) + dayMinutes) % dayMinutes;
}

export function estimatedSleepMinutes(entry: PlannerSleepEntry) {
  return Math.max(0, sleepDurationMinutes(entry.bedtime, entry.wakeTime) - (entry.awakeMinutes ?? 0));
}

function durationRating(minutes: number) {
  for (let i = 1; i < durationScale.length; i++) {
    const [end, upper] = durationScale[i]!;
    if (minutes <= end) {
      const [start, lower] = durationScale[i - 1]!;
      return lower + Math.max(0, minutes - start) * (upper - lower) / (end - start);
    }
  }
  return 100;
}

function bedtimeDeviation(entry: PlannerSleepEntry, history: PlannerSleepEntry[]) {
  const from = new Date(entry.date + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate() - 14);
  const firstDay = from.toISOString().slice(0, 10);
  const bedtimes = history
    .filter((night) => night.date >= firstDay && night.date < entry.date && night.id !== entry.id)
    .map((night) => clockMinutes(night.bedtime))
    .sort((a, b) => a - b);
  if (bedtimes.length < 5) return null;

  // Unwrap the clock at the largest gap so the median also works across midnight.
  let origin = bedtimes[0]!;
  let largestGap = origin + dayMinutes - bedtimes.at(-1)!;
  for (let i = 1; i < bedtimes.length; i++) {
    const gap = bedtimes[i]! - bedtimes[i - 1]!;
    if (gap > largestGap) {
      largestGap = gap;
      origin = bedtimes[i]!;
    }
  }
  const ordered = bedtimes.map((time) => time < origin ? time + dayMinutes : time).sort((a, b) => a - b);
  const middle = (ordered.length - 1) / 2;
  const median = (ordered[Math.floor(middle)]! + ordered[Math.ceil(middle)]!) / 2;
  return (clockMinutes(entry.bedtime) - median + dayMinutes * 2.5) % dayMinutes - dayMinutes / 2;
}

function recentShortNights(entry: PlannerSleepEntry, history: PlannerSleepEntry[], minutes: number) {
  let nights = 0;
  let deficit = 0;
  if (minutes < shortNightMinutes) {
    const day = new Date(entry.date + "T00:00:00Z");
    while (nights < 3) {
      day.setUTCDate(day.getUTCDate() - 1);
      const date = day.toISOString().slice(0, 10);
      const previous = history.find((night) => night.date === date && night.id !== entry.id);
      if (!previous) break;
      const shortfall = shortNightMinutes - estimatedSleepMinutes(previous);
      if (shortfall <= 0) break;
      deficit += shortfall;
      nights++;
    }
  }
  return { nights, penalty: Math.min(10, deficit / 20) };
}

export function sleepIndexBreakdown(entry: PlannerSleepEntry, history: PlannerSleepEntry[]) {
  const minutes = estimatedSleepMinutes(entry);
  const deviation = bedtimeDeviation(entry, history);
  const weights = sleepIndexWeights;
  const duration = durationRating(minutes) * weights.duration / 100;
  const awakenings = entry.awakenings == null ? null : awakeningScale[Math.min(entry.awakenings, 4)]!;
  const timing = deviation == null ? null : Math.max(0, 1 - Math.max(0, Math.abs(deviation) - 60) / 120) * weights.timing;
  const available = weights.duration + (awakenings == null ? 0 : weights.awakenings) + (timing == null ? 0 : weights.timing);
  const shortNights = recentShortNights(entry, history, minutes);
  const base = (duration + (awakenings ?? 0) + (timing ?? 0)) * 100 / available;
  const total = Math.max(0, Math.round(base - shortNights.penalty));
  return { total, minutes, duration, awakenings, timing, deviation, available, shortNights };
}

export function dayScore(report: SleepReport) {
  return Math.round((report.energy + (11 - report.sleepiness) + report.clarity + report.mood) * 2.5);
}

export function sleepIndex(entry: PlannerSleepEntry, history: PlannerSleepEntry[]) {
  return sleepIndexBreakdown(entry, history).total;
}
