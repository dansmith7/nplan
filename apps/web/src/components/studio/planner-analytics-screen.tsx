import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Heart,
  MoonStar,
  X,
  Zap,
} from "lucide-react";
import { usePlannerDailyCards } from "@/hooks/use-planner-daily-cards";
import { usePlannerSleepEntries } from "@/hooks/use-planner-sleep-entries";
import {
  dayScore,
  sleepIndex,
  sleepIndexBreakdown,
} from "./planner-sleep-index";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import "@/components/arc/foundation.scoped.css";
import { CalendarRating } from "./calendar-rating";
import { buildObservations, workoutStatus } from "./planner-observations";
import { PlannerObservationsPanel } from "./planner-observations-panel";
import "./planner-analytics-screen.css";
import "./planner-observations.css";

const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const minutes = (bed: string, wake: string) => {
  const [bh = 0, bm = 0] = bed.split(":").map(Number),
    [wh = 0, wm = 0] = wake.split(":").map(Number);
  let end = wh * 60 + wm;
  const start = bh * 60 + bm;
  if (end <= start) end += 1440;
  return end - start;
};
const short = (value?: number) =>
  value
    ? `${Math.floor(value / 60)}ч ${String(value % 60).padStart(2, "0")}м`
    : "—";
const avg = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const number = (value: number | null, digits = 1) =>
  value === null ? "—" : value.toFixed(digits).replace(".", ",");
const monthTitle = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(
    new Date(`${value}-01T12:00:00`)
  );
const shiftMonth = (value: string, offset: number) => {
  const date = new Date(`${value}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return date.toISOString().slice(0, 7);
};
const monthDays = (value: string) => {
  const start = new Date(`${value}-01T12:00:00`),
    length = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate(),
    gap = (start.getDay() + 6) % 7;
  return Array.from({ length: gap + length }, (_, index) =>
    index < gap ? null : `${value}-${String(index - gap + 1).padStart(2, "0")}`
  );
};
const moodClass = (mood?: number) =>
  mood === undefined
    ? ""
    : mood >= 8
      ? "bright"
      : mood >= 6
        ? "steady"
        : mood >= 4
          ? "quiet"
          : "low";
const weekday = (day: string) => (new Date(`${day}T12:00:00`).getDay() + 6) % 7;
const dayName = (day: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${day}T12:00:00`));

export function PlannerAnalyticsScreen() {
  const [month, setMonth] = React.useState(() => today().slice(0, 7));
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const [ratingView, setRatingView] = React.useState<"sleep" | "day">("sleep");
  const cardsQuery = usePlannerDailyCards(addDays(today(), -365));
  const sleepQuery = usePlannerSleepEntries();
  const cards = cardsQuery.data ?? [],
    sleep = sleepQuery.data ?? [];
  const sleepHistory = [...sleep].sort((a, b) => b.date.localeCompare(a.date));
  const cardByDay = React.useMemo(
    () => new Map(cards.map((card) => [card.day, card])),
    [cards]
  );
  const sleepByDay = React.useMemo(
    () => new Map(sleep.map((entry) => [entry.date, entry])),
    [sleep]
  );
  const calendar = monthDays(month);
  const monthEntries = calendar.flatMap((day) =>
    day ? [{ day, card: cardByDay.get(day), night: sleepByDay.get(day) }] : []
  );
  const sleepValues = monthEntries.flatMap(({ night }) =>
    night ? [minutes(night.bedtime, night.wakeTime) / 60] : []
  );
  const ratingValues = monthEntries.flatMap(({ night }) =>
    night && (ratingView === "sleep" || night.dayReport)
      ? [
          ratingView === "sleep"
            ? sleepIndex(night, sleepHistory)
            : dayScore(night.dayReport!),
        ]
      : []
  );
  const sexDays = monthEntries.filter(({ card }) => card?.had_sex).length;
  const workoutDays = monthEntries.filter(({ card }) =>
    card ? workoutStatus(card) === true : false
  ).length;
  const selectedCard = selectedDay ? cardByDay.get(selectedDay) : undefined,
    selectedNight = selectedDay ? sleepByDay.get(selectedDay) : undefined;
  const selectedSleepScore = selectedNight
    ? sleepIndexBreakdown(selectedNight, sleepHistory)
    : null;
  const rhythmSleep = sleep.filter(
    (entry) => entry.date >= addDays(today(), -89) && entry.date <= today()
  );
  const observations = React.useMemo(
    () => buildObservations(cards, sleep, today()),
    [cards, sleep]
  );
  const rhythm = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(
    (label, index) => {
      const entries = rhythmSleep.filter(
        (entry) => weekday(entry.date) === index
      );
      return {
        label,
        count: entries.length,
        sleep: avg(
          entries.map((entry) => minutes(entry.bedtime, entry.wakeTime) / 60)
        ),
        mood: avg(
          entries.flatMap((entry) =>
            entry.dayReport ? [entry.dayReport.mood] : []
          )
        ),
        energy: avg(
          entries.flatMap((entry) =>
            entry.dayReport ? [entry.dayReport.energy] : []
          )
        ),
        workouts: cards.filter(
          (card) => weekday(card.day) === index && workoutStatus(card) === true
        ).length,
      };
    }
  );

  return (
    <section
      className="analytics-screen analytics-arc"
      data-theme="dark"
      data-accent="amber"
    >
      <header className="analytics-heading">
        <div>
          <span>ЛИЧНАЯ АНАЛИТИКА</span>
          <h1>Картина.</h1>
          <p>Помогает заметить повторяющиеся условия твоего дня.</p>
        </div>
      </header>
      <section className="analytics-calendar">
        <header>
          <div>
            <span>КАЛЕНДАРЬ СОСТОЯНИЙ</span>
            <h2>
              <CalendarDays size={19} />
              {monthTitle(month)}
            </h2>
          </div>
          <nav aria-label="Сменить месяц">
            <button
              aria-label="Предыдущий месяц"
              onClick={() => setMonth((value) => shiftMonth(value, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => setMonth(today().slice(0, 7))}>
              Сегодня
            </button>
            <button
              aria-label="Следующий месяц"
              onClick={() => setMonth((value) => shiftMonth(value, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </nav>
        </header>
        <div className="calendar-mode-control">
          <SegmentedControl
            label="Показатель календаря"
            value={ratingView}
            onValueChange={(value) =>
              setRatingView(value === "day" ? "day" : "sleep")
            }
            options={[
              { value: "sleep", label: "Индекс сна" },
              { value: "day", label: "Индекс дня" },
            ]}
          />
          <span className="calendar-mode-hint" aria-live="polite">
            {ratingView === "sleep"
              ? "Полоски показывают индекс сна"
              : "Полоски показывают индекс дня"}
          </span>
        </div>
        <div className="calendar-legend">
          <span>
            <i className="bright" />
            настроение
          </span>
          <span>
            <Zap size={12} /> энергия
          </span>
          <span>
            <Heart size={12} /> близость
          </span>
          <span>
            <Dumbbell size={12} /> тренировка
          </span>
          <span>
            <b className={ratingView === "day" ? "day" : ""} />
            {ratingView === "sleep" ? "индекс сна" : "индекс дня"}
          </span>
        </div>
        <div className="month-grid">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
            <span className="month-weekday" key={day}>
              {day}
            </span>
          ))}
          {calendar.map((day, index) => {
            const card = day ? cardByDay.get(day) : undefined,
              night = day ? sleepByDay.get(day) : undefined,
              mood = night?.dayReport?.mood,
              energy = night?.dayReport?.energy,
              indexValue =
                night && (ratingView === "sleep" || night.dayReport)
                  ? ratingView === "sleep"
                    ? sleepIndex(night, sleepHistory)
                    : dayScore(night.dayReport!)
                  : null;
            return day ? (
              <button
                className={`month-day ${moodClass(mood)} ${day === today() ? "today" : ""} ${selectedDay === day ? "selected" : ""}`}
                key={day}
                onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                aria-pressed={selectedDay === day}
                aria-label={`Открыть детали: ${dayName(day)}${indexValue !== null ? `, ${ratingView === "sleep" ? "индекс сна" : "индекс дня"} ${indexValue} из 100` : ""}`}
              >
                <strong>{day.slice(8)}</strong>
                <div className="month-marks">
                  {mood !== undefined ? <span>{mood}/10</span> : null}
                  {card?.had_sex ? (
                    <Heart size={13} fill="currentColor" />
                  ) : null}
                  {card?.workout_type ? <Dumbbell size={13} /> : null}
                </div>
                {energy !== undefined ? (
                  <span className="month-energy">
                    <Zap size={11} fill="currentColor" />
                    {energy}/10
                  </span>
                ) : null}
                {night ? (
                  <CalendarRating value={indexValue} mode={ratingView} />
                ) : null}
              </button>
            ) : (
              <i className="month-gap" key={`gap-${index}`} />
            );
          })}
        </div>
        <footer className="calendar-summary">
          <div>
            <span>
              {ratingView === "sleep"
                ? "Средний индекс сна"
                : "Средний индекс дня"}
            </span>
            <strong>
              {ratingValues.length ? Math.round(avg(ratingValues)!) : "—"}
              <small>/100</small>
            </strong>
          </div>
          <div>
            <span>Средний сон</span>
            <strong>
              {short(
                avg(sleepValues)
                  ? Math.round(avg(sleepValues)! * 60)
                  : undefined
              )}
            </strong>
          </div>
          <div>
            <span>Дни с близостью</span>
            <strong>{sexDays}</strong>
          </div>
          <div>
            <span>Тренировки</span>
            <strong>{workoutDays}</strong>
          </div>
        </footer>
        {selectedDay ? (
          <section className="calendar-detail">
            <header>
              <div>
                <span>ДЕТАЛИ ДНЯ</span>
                <h3>{dayName(selectedDay)}</h3>
              </div>
              <button
                aria-label="Закрыть детали"
                onClick={() => setSelectedDay(null)}
              >
                <X size={17} />
              </button>
            </header>
            <div>
              {selectedNight ? (
                <article>
                  <MoonStar size={17} />
                  <span>Период сна по записи</span>
                  <strong>
                    {short(
                      minutes(selectedNight.bedtime, selectedNight.wakeTime)
                    )}
                  </strong>
                  <small>
                    {selectedNight.bedtime} — {selectedNight.wakeTime} ·{" "}
                    {selectedNight.awakenings
                      ? `${selectedNight.awakenings} пробужд.`
                      : "без пробуждений"}
                  </small>
                </article>
              ) : null}
              {selectedSleepScore ? (
                <article>
                  <MoonStar size={17} />
                  <span>Как получен индекс</span>
                  <strong>
                    {selectedSleepScore.total}/100 · ночь{" "}
                    {selectedSleepScore.nightly}/100
                  </strong>
                  <small>
                    Длительность {selectedSleepScore.durationScore} · ритм{" "}
                    {selectedSleepScore.timingScore} · пробуждения{" "}
                    {selectedSleepScore.awakeningScore}
                    {selectedSleepScore.latePenalty
                      ? ` · поздний отход −${selectedSleepScore.latePenalty}`
                      : ""}
                  </small>
                  <small>
                    {selectedSleepScore.timingDifference === null
                      ? "Для сравнения ритма пока нет прежних ночей."
                      : `Отклонение от предыдущих ночей: ${Math.floor(selectedSleepScore.timingDifference / 60)} ч ${selectedSleepScore.timingDifference % 60} мин.`}{" "}
                    {selectedSleepScore.daytime === null
                      ? "Дневная анкета пока не заполнена."
                      : `Дневная оценка ${selectedSleepScore.daytime}/100.`}
                  </small>
                </article>
              ) : null}
              {selectedNight?.dayReport ? (
                <article>
                  <Zap size={17} />
                  <span>
                    Индекс дня · {dayScore(selectedNight.dayReport)}/100
                  </span>
                  <strong>
                    {selectedNight.dayReport.energy}/10 энергия ·{" "}
                    {selectedNight.dayReport.mood}/10 настроение
                  </strong>
                  <small>
                    ясность {selectedNight.dayReport.clarity}/10 · сонливость{" "}
                    {selectedNight.dayReport.sleepiness}/10
                  </small>
                </article>
              ) : null}
              {selectedCard ? (
                <article>
                  <Dumbbell size={17} />
                  <span>Контекст</span>
                  <strong>
                    {[
                      selectedCard.workout_type,
                      selectedCard.had_sex ? "близость" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "без отметок"}
                  </strong>
                  <small>
                    {[
                      selectedCard.workout_minutes
                        ? `${selectedCard.workout_minutes} мин.`
                        : null,
                      selectedCard.alcohol_units
                        ? `алкоголь ${selectedCard.alcohol_units}`
                        : null,
                      selectedCard.ate_junk_food ? "вредная еда" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") ||
                      selectedCard.note ||
                      ""}
                  </small>
                </article>
              ) : null}
              {!selectedNight && !selectedCard ? (
                <p>На этот день пока нет отметок.</p>
              ) : null}
            </div>
          </section>
        ) : null}
      </section>
      <div className="analytics-lower">
        <PlannerObservationsPanel
          groups={observations}
          isLoading={cardsQuery.isLoading || sleepQuery.isLoading}
          isError={cardsQuery.isError || sleepQuery.isError}
          onRetry={() => {
            void cardsQuery.refetch();
            void sleepQuery.refetch();
          }}
        />
        <section className="analytics-rhythm">
          <header>
            <div>
              <span>РИТМ НЕДЕЛИ</span>
              <h2>Как обычно проходят дни</h2>
            </div>
            <p>средние по записям за 90 дней</p>
          </header>
          <div className="rhythm-grid">
            {rhythm.map((day) => (
              <article key={day.label}>
                <strong>{day.label}</strong>
                <small className="rhythm-sample">{day.count} записей</small>
                <span>
                  сон <b>{number(day.sleep)}ч</b>
                </span>
                <span>
                  энергия <b>{number(day.energy)}</b>
                </span>
                <span>
                  настроение <b>{number(day.mood)}</b>
                </span>
                {day.workouts ? (
                  <i>
                    <Dumbbell size={11} />
                    {day.workouts}
                  </i>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
