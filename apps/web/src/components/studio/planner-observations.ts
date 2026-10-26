import type { PlannerDailyCard } from "@/hooks/use-planner-daily-card";
import type { PlannerSleepEntry } from "@/hooks/use-planner-sleep-entries";

export type Observation = {
  id: string;
  finding: string;
  evidence: string;
  suggestion: string;
  status: "signal" | "neutral" | "insufficient";
};
export type ObservationGroup = {
  id: string;
  title: string;
  items: Observation[];
};
type Point = { date: string; group: boolean | null; value: number | undefined };
type Metric = {
  key: "energy" | "clarity" | "sleepiness" | "mood";
  label: string;
};
const metrics: Metric[] = [
  { key: "energy", label: "энергия" },
  { key: "clarity", label: "ясность" },
  { key: "sleepiness", label: "сонливость" },
];
const MIN_GROUP = 5;
export const average = (values: number[]) =>
  values.reduce((sum, n) => sum + n, 0) / values.length;
const decimal = (n: number) => n.toFixed(1).replace(".", ",");
const valid = (n: number | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);
const shortDate = (day: string) => `${day.slice(8)}.${day.slice(5, 7)}`;
export function shiftObservationDay(day: string, offset: number) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
export function recordedSleepMinutes(entry: PlannerSleepEntry) {
  const clock = (time: string) => {
    const [h = 0, m = 0] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const length = clock(entry.wakeTime) - clock(entry.bedtime);
  return length > 0 ? length : length + 1440;
}
const bedtimeMinutes = (entry: PlannerSleepEntry) => {
  const [h = 0, m = 0] = entry.bedtime.split(":").map(Number);
  return h * 60 + m + (h < 12 ? 1440 : 0);
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length === 0
    ? 0
    : sorted.length % 2
      ? sorted[middle]!
      : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const period = (dates: string[]) => {
  const sorted = [...dates].sort();
  return sorted.length
    ? `${shortDate(sorted[0]!)}–${shortDate(sorted[sorted.length - 1]!)}`
    : "Нет записей";
};
export function workoutStatus(
  card?: Pick<
    PlannerDailyCard,
    "had_workout" | "workout_type" | "workout_minutes"
  >
): boolean {
  return Boolean(
    card?.had_workout ||
    card?.workout_type?.trim() ||
    (card?.workout_minutes ?? 0) > 0
  );
}

function compare(
  id: string,
  points: Point[],
  context: string,
  label: string,
  suggestion: string,
  threshold = 0.6,
  unit = "п.",
  groupLabels?: readonly [string, string]
): Observation {
  const known = points.filter((p) => p.group !== null && valid(p.value));
  const yes = known.filter((p) => p.group).map((p) => p.value!);
  const no = known.filter((p) => !p.group).map((p) => p.value!);
  const counts = groupLabels
    ? `${groupLabels[0]}: ${yes.length} · ${groupLabels[1]}: ${no.length}`
    : `группы ${yes.length} и ${no.length} записей`;
  const evidence = `${period(known.map((p) => p.date))} · ${counts}`;
  const needed = groupLabels
    ? [yes, no]
        .flatMap((values, index) =>
          values.length < MIN_GROUP
            ? [`${groupLabels[index]}: ещё ${MIN_GROUP - values.length}`]
            : []
        )
        .join("; ")
    : `${Math.max(0, MIN_GROUP - yes.length)} и ${Math.max(0, MIN_GROUP - no.length)} соответственно`;
  if (yes.length < MIN_GROUP || no.length < MIN_GROUP)
    return {
      id,
      status: "insufficient",
      finding: context,
      evidence: `${evidence}. Для сравнения нужно ${needed}.`,
      suggestion: groupLabels
        ? "Нужно хотя бы 5 записей с нужной оценкой в каждой группе. День без отметки тренировки считается днём отдыха; отдельно отмечать его не нужно."
        : "Для сравнения нужны хотя бы 5 заполненных записей в каждой группе. Пропуски не считаются ответом «нет».",
    };
  const difference = average(yes) - average(no);
  const signal = Math.abs(difference) >= threshold;
  return {
    id,
    status: signal ? "signal" : "neutral",
    finding: signal
      ? `${context}: ${label} в среднем на ${decimal(Math.abs(difference))} ${unit} ${difference > 0 ? "выше" : "ниже"}.`
      : `${context}: заметной разницы по показателю «${label}» пока нет.`,
    evidence: `${evidence} · средние ${decimal(average(yes))} и ${decimal(average(no))} ${unit}`,
    suggestion: signal
      ? suggestion
      : "Продолжай записи в обычном режиме. Это сравнение пока не даёт основания менять привычку.",
  };
}

/** Dates name the day of waking. A habit on D is paired with the night ending on D+1. */
export function buildObservations(
  allCards: PlannerDailyCard[],
  allSleep: PlannerSleepEntry[],
  today: string
): ObservationGroup[] {
  const from = shiftObservationDay(today, -89);
  const sleep = allSleep
    .filter((n) => n.date >= from && n.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const cards = allCards.filter((c) => c.day >= from && c.day <= today);
  const byDay = new Map(sleep.map((n) => [n.date, n]));
  const durationMedian = sleep.length
    ? median(sleep.map(recordedSleepMinutes))
    : 0;
  const duration = metrics.map((metric) =>
    compare(
      `duration-${metric.key}`,
      sleep.map((n) => ({
        date: n.date,
        group: recordedSleepMinutes(n) >= durationMedian,
        value: n.dayReport?.[metric.key],
      })),
      sleep.length
        ? `После более длинных записей сна (от ${decimal(durationMedian / 60)} ч) по сравнению с более короткими`
        : "Сравнение более длинных и более коротких записей сна",
      metric.label,
      "На следующей неделе понаблюдай, повторяется ли разница в похожие по нагрузке дни. Длительность здесь рассчитана по времени отхода и подъёма, а не измерена трекером."
    )
  );

  const timing = new Map<string, boolean | null>();
  for (const night of sleep) {
    const previous = allSleep
      .filter(
        (n) =>
          n.date < night.date && n.date >= shiftObservationDay(night.date, -14)
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7);
    if (previous.length < 3) {
      timing.set(night.date, null);
      continue;
    }
    const deviation = Math.max(
      Math.abs(bedtimeMinutes(night) - median(previous.map(bedtimeMinutes))),
      Math.abs(wakeMinutes(night) - median(previous.map(wakeMinutes)))
    );
    timing.set(
      night.date,
      deviation <= 45 ? true : deviation >= 90 ? false : null
    );
  }
  const schedule = metrics.map((metric) =>
    compare(
      `schedule-${metric.key}`,
      sleep.map((n) => ({
        date: n.date,
        group: timing.get(n.date) ?? null,
        value: n.dayReport?.[metric.key],
      })),
      "После привычного режима по сравнению со сдвигом от 1,5 часа",
      metric.label,
      "Проверь, сохраняется ли разница отдельно в рабочие и выходные дни при похожей длительности сна. Сам сдвиг режима здесь не доказывает пользу или вред; выбери одно условие для наблюдения на следующую неделю."
    )
  );

  const cardByDay = new Map(cards.map((card) => [card.day, card]));
  const trainingGroups = ["с тренировкой", "без тренировки"] as const;
  const followingNights = sleep.filter(
    (night) => shiftObservationDay(night.date, -1) >= from
  );
  const training: Observation[] = [];
  for (const offset of [0, 1]) {
    training.push(
      compare(
        `training-energy-${offset}`,
        (offset ? followingNights : sleep).map((night) => {
          const day = shiftObservationDay(night.date, -offset);
          return {
            date: day,
            group: workoutStatus(cardByDay.get(day)),
            value: night.dayReport?.energy,
          };
        }),
        offset
          ? "На следующий день после тренировки по сравнению с днём отдыха"
          : "В день тренировки по сравнению с днём отдыха",
        "энергия",
        "Проверь, сохраняется ли разница при похожей длительности сна; время тренировки пока не записывается.",
        0.6,
        "п.",
        trainingGroups
      )
    );
  }
  training.push(
    compare(
      "training-sleep",
      followingNights.map((night) => {
        const day = shiftObservationDay(night.date, -1);
        return {
          date: day,
          group: workoutStatus(cardByDay.get(day)),
          value: recordedSleepMinutes(night) / 60,
        };
      }),
      "Ночью после тренировки по сравнению с ночью после отдыха",
      "длительность по записи",
      "Сопоставь тип и продолжительность тренировок с последующей ночью. Меняй только одно условие за раз, чтобы проверить наблюдение.",
      0.5,
      "ч",
      trainingGroups
    )
  );
  training.push(
    compare(
      "training-awakenings",
      followingNights.map((night) => {
        const day = shiftObservationDay(night.date, -1);
        return {
          date: day,
          group: workoutStatus(cardByDay.get(day)),
          value: night.awakenings,
        };
      }),
      "Ночью после тренировки по сравнению с ночью после отдыха",
      "число пробуждений",
      "Понаблюдай за последующими ночами ещё неделю и учитывай другие отмеченные события дня.",
      0.5,
      "пробужд.",
      trainingGroups
    )
  );

  const habits: Observation[] = [];
  for (const habit of ["alcohol", "food"] as const) {
    const habitGroup = (c: PlannerDailyCard) =>
      habit === "alcohol"
        ? c.alcohol_units === null
          ? null
          : c.alcohol_units > 0
        : c.ate_junk_food;
    const context =
      habit === "alcohol"
        ? "После дней с отметкой алкоголя по сравнению с явной отметкой 0"
        : "После дней с отметкой «вредная еда» по сравнению с ответом «нет»";
    const suggestion =
      "Это совпадение в записях. Сравни несколько похожих дней с разными отметками, учитывая режим и нагрузку. Пустые поля исключены из расчёта.";
    habits.push(
      compare(
        `${habit}-sleep`,
        cards.map((c) => {
          const night = byDay.get(shiftObservationDay(c.day, 1));
          return {
            date: c.day,
            group: habitGroup(c),
            value: night ? recordedSleepMinutes(night) / 60 : undefined,
          };
        }),
        context,
        "длительность по записи",
        suggestion,
        0.5,
        "ч"
      )
    );
    habits.push(
      compare(
        `${habit}-awakenings`,
        cards.map((c) => ({
          date: c.day,
          group: habitGroup(c),
          value: byDay.get(shiftObservationDay(c.day, 1))?.awakenings,
        })),
        context,
        "число пробуждений",
        suggestion,
        0.5,
        "пробужд."
      )
    );
    habits.push(
      compare(
        `${habit}-energy`,
        cards.map((c) => ({
          date: c.day,
          group: habitGroup(c),
          value: byDay.get(shiftObservationDay(c.day, 1))?.dayReport?.energy,
        })),
        context,
        "энергия на следующий день",
        suggestion
      )
    );
  }

  const weekdayNames = [
    "понедельникам",
    "вторникам",
    "средам",
    "четвергам",
    "пятницам",
    "субботам",
    "воскресеньям",
  ];
  const weekdayItems: Observation[] = [];
  for (let day = 0; day < 7; day++) {
    const matching = sleep.filter(
      (n) => weekday(n.date) === day && n.dayReport
    );
    const other = sleep.filter((n) => weekday(n.date) !== day && n.dayReport);
    if (matching.length < 4 || other.length < 8) continue;
    for (const metric of metrics.slice(0, 2)) {
      const delta =
        average(matching.map((n) => n.dayReport![metric.key])) -
        average(other.map((n) => n.dayReport![metric.key]));
      if (Math.abs(delta) < 0.6) continue;
      weekdayItems.push({
        id: `weekday-${day}-${metric.key}`,
        status: "signal",
        finding: `По ${weekdayNames[day]} ${metric.label} в среднем на ${decimal(Math.abs(delta))} п. ${delta > 0 ? "выше" : "ниже"}, чем в остальные отмеченные дни.`,
        evidence: `${period(sleep.map((n) => n.date))} · ${matching.length} таких дней и ${other.length} остальных`,
        suggestion:
          delta > 0
            ? "Можно попробовать планировать на этот день одну задачу, требующую сосредоточенности, и проверить, насколько ритм повторяется."
            : "При планировании оставь в этот день немного запаса и сравни следующие недели. Расписание и сон могут объяснять часть разницы.",
      });
    }
  }
  const weekdayReady = Array.from({ length: 7 }, (_, day) => day).some(
    (day) => {
      const reports = sleep.filter((n) => n.dayReport);
      const count = reports.filter((n) => weekday(n.date) === day).length;
      return count >= 4 && reports.length - count >= 8;
    }
  );
  if (!weekdayItems.length)
    weekdayItems.push({
      id: "weekday-empty",
      status: weekdayReady ? "neutral" : "insufficient",
      finding: "Устойчивого различия между днями недели пока не видно.",
      evidence: `${period(sleep.map((n) => n.date))} · нужны 4 оценки одного дня недели и 8 оценок остальных дней; разница от 0,6 п.`,
      suggestion:
        "Продолжай дневные оценки. Ритм будет рассчитан по фактически заполненным дням.",
    });

  const recentStart = shiftObservationDay(today, -6),
    baselineStart = shiftObservationDay(today, -34);
  const recent = sleep.filter((n) => n.date >= recentStart),
    baseline = sleep.filter(
      (n) => n.date >= baselineStart && n.date < recentStart
    );
  const trends: Observation[] = [];
  const trendMetrics = [
    ...[...metrics, { key: "mood", label: "настроение" } as Metric].map(
      (m) => ({
        id: m.key,
        label: m.label,
        get: (n: PlannerSleepEntry) => n.dayReport?.[m.key],
        threshold: 0.6,
        unit: "п.",
      })
    ),
    {
      id: "duration",
      label: "длительность сна по записи",
      get: (n: PlannerSleepEntry) => recordedSleepMinutes(n) / 60,
      threshold: 0.5,
      unit: "ч",
    },
    {
      id: "bedtime",
      label: "время отхода ко сну",
      get: bedtimeMinutes,
      threshold: 30,
      unit: "мин.",
    },
  ];
  for (const metric of trendMetrics) {
    const a = recent.map(metric.get).filter(valid),
      b = baseline.map(metric.get).filter(valid);
    if (a.length < 3 || b.length < 7) continue;
    const delta = average(a) - average(b),
      signal = Math.abs(delta) >= metric.threshold;
    trends.push({
      id: `trend-${metric.id}`,
      status: signal ? "signal" : "neutral",
      finding: signal
        ? `За последние 7 дней ${metric.label} ${metric.id === "bedtime" ? `сдвинулось на ${Math.round(Math.abs(delta))} мин. ${delta > 0 ? "позже" : "раньше"}` : `в среднем на ${decimal(Math.abs(delta))} ${metric.unit} ${delta > 0 ? "выше" : "ниже"}`}, чем за предыдущие 28 дней.`
        : `За последние 7 дней показатель «${metric.label}» близок к предыдущим 28 дням.`,
      evidence: `${shortDate(recentStart)}–${shortDate(today)}: ${a.length} записей · ${shortDate(baselineStart)}–${shortDate(shiftObservationDay(recentStart, -1))}: ${b.length} записей`,
      suggestion: signal
        ? "Посмотри, что изменилось в нагрузке и привычках за эту неделю. Выбери одно условие для наблюдения на следующую."
        : "Продолжай отмечать день. Заполнять каждый день необязательно; пропуски не заменяются нулями.",
    });
  }
  if (!trends.length)
    trends.push({
      id: "trend-empty",
      status: "insufficient",
      finding: "Для сравнения недели с предыдущим месяцем пока мало записей.",
      evidence: `За последние 7 дней: ${recent.length} ночей; за предыдущие 28: ${baseline.length}. Для каждого показателя нужно минимум 3 и 7 оценок.`,
      suggestion:
        "Добавляй записи сна и дневные оценки по возможности. Сравниваются непересекающиеся периоды.",
    });

  const groups: ObservationGroup[] = [
    { id: "duration", title: "Длительность сна и день", items: duration },
    { id: "schedule", title: "Стабильность режима", items: schedule },
    { id: "training", title: "Тренировки и восстановление", items: training },
    { id: "habits", title: "Привычки и следующая ночь", items: habits },
    { id: "weekday", title: "Ритм недели и планы", items: weekdayItems },
    { id: "trends", title: "Что изменилось за неделю", items: trends },
  ];
  const priority = { signal: 0, neutral: 1, insufficient: 2 };
  return groups.map((group) => ({
    ...group,
    items: group.items.sort((a, b) => priority[a.status] - priority[b.status]),
  }));
}

const weekday = (day: string) =>
  (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
const wakeMinutes = (entry: PlannerSleepEntry) => {
  const [h = 0, m = 0] = entry.wakeTime.split(":").map(Number);
  return h * 60 + m;
};
