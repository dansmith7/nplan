import * as React from "react";
import { BarChart3, Dumbbell, MoonStar, TrendingUp } from "lucide-react";
import { usePlannerDailyCards } from "@/hooks/use-planner-daily-cards";
import "./planner-analytics-screen.css";

type Sleep = { date: string; bedtime: string; wakeTime: string; dayReport?: { energy: number; mood: number } };
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dates = (days: number) => Array.from({ length: days }, (_, i) => addDays(today(), i - days + 1));
const minutes = (bed: string, wake: string) => { const [bh = 0, bm = 0] = bed.split(":").map(Number), [wh = 0, wm = 0] = wake.split(":").map(Number); let end = wh * 60 + wm, start = bh * 60 + bm; if (end <= start) end += 1440; return end - start; };
const readSleep = (): Sleep[] => { try { const raw: unknown = JSON.parse(localStorage.getItem("nplan-sleep-entries") ?? "[]"); return Array.isArray(raw) ? raw.filter((v): v is Sleep => Boolean(v && typeof v === "object" && (v as Sleep).date && (v as Sleep).bedtime && (v as Sleep).wakeTime)) : []; } catch { return []; } };
const short = (v?: number) => v ? `${Math.floor(v / 60)}ч ${String(v % 60).padStart(2, "0")}м` : "—";
const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const demoEnabled = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
const demoSleep = (): Sleep[] => dates(7).map((date, index) => ({ date, bedtime: ["23:35", "00:20", "23:10", "00:05", "23:45", "01:10", "23:30"][index]!, wakeTime: ["07:20", "07:50", "06:55", "08:10", "07:30", "09:05", "07:15"][index]!, dayReport: { energy: [7, 5, 8, 6, 7, 4, 8][index]!, mood: [7, 5, 8, 6, 7, 4, 8][index]! } }));

export function PlannerAnalyticsScreen() {
  const [range, setRange] = React.useState<30 | 90>(30);
  const [metric, setMetric] = React.useState<"sleep" | "energy" | "weight">("sleep");
  const cardsQuery = usePlannerDailyCards(addDays(today(), -89));
  const [sleep, setSleep] = React.useState<Sleep[]>([]);
  const demo = demoEnabled();
  React.useEffect(() => { if (demo) { setSleep(demoSleep()); return; } setSleep(readSleep()); const update = () => setSleep(readSleep()); window.addEventListener("nplan-sleep-entry-changed", update); return () => window.removeEventListener("nplan-sleep-entry-changed", update); }, [demo]);
  const cards = demo ? dates(7).map((day, index) => ({ id: `demo-${day}`, day, workout_type: [null, "зал", null, "бег", null, null, "йога"][index], workout_minutes: [null, 50, null, 35, null, null, 45][index], activity_note: null, had_sex: null, alcohol_units: [null, null, 2, null, null, 3, null][index], cigarettes: null, ate_junk_food: [false, false, true, false, false, true, false][index], weight_kg: 74.2 - index * 0.05, note: null })) : cardsQuery.data ?? [];
  const cardByDay = React.useMemo(() => new Map(cards.map((c) => [c.day, c])), [cards]);
  const sleepByDay = React.useMemo(() => new Map(sleep.map((s) => [s.date, s])), [sleep]);
  const week = dates(7);
  const points = dates(range).map((day) => { const card = cardByDay.get(day), night = sleepByDay.get(day); return { day, card, night, value: metric === "sleep" ? (night ? minutes(night.bedtime, night.wakeTime) / 60 : null) : metric === "energy" ? night?.dayReport?.energy ?? null : card?.weight_kg ?? null }; });
  const trainingEnergy = cards.flatMap((c) => { const e = sleepByDay.get(c.day)?.dayReport?.energy; return c.workout_type && e ? [e] : []; });
  const restEnergy = cards.flatMap((c) => { const e = sleepByDay.get(c.day)?.dayReport?.energy; return !c.workout_type && e ? [e] : []; });
  const relationReady = trainingEnergy.length >= 5 && restEnergy.length >= 5;
  const max = Math.max(...points.map((p) => p.value ?? 0), 1);
  const filled = points.filter((p) => p.value !== null).length;
  return <section className="analytics-screen"><header className="analytics-heading"><div><span>ЛИЧНАЯ АНАЛИТИКА</span><h1>Картина.</h1><p>Не оценивает тебя — помогает заметить повторяющиеся условия.</p></div><div className="analytics-range">{([30, 90] as const).map((v) => <button className={range === v ? "active" : ""} key={v} onClick={() => setRange(v)}>{v} дней</button>)}</div></header>
    <section className="analytics-week"><header><div><span>НЕДЕЛЯ ОДНИМ ВЗГЛЯДОМ</span><h2>Последние 7 дней</h2></div><p>{cards.length || sleep.length ? "факты, которые ты отметил" : "появится после первых записей"}</p></header><div className="week-ribbon">{week.map((day) => { const card = cardByDay.get(day), night = sleepByDay.get(day); const labels = [card?.workout_type ? "тренировка" : null, card?.alcohol_units ? `алк. ${card.alcohol_units}` : null, card?.ate_junk_food ? "еда" : null].filter((label): label is string => label !== null); return <article key={day} className={card || night ? "filled" : ""}><span>{new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(new Date(`${day}T12:00:00`)).slice(0, 2)}</span><strong>{day.slice(8)}</strong><b>{night ? short(minutes(night.bedtime, night.wakeTime)) : "—"}</b><small>{night?.dayReport ? `энергия ${night.dayReport.energy}/10` : ""}</small><footer>{labels.map((l) => <i key={l}>{l}</i>)}</footer></article>; })}</div></section>
    <div className="analytics-lower"><section className="analytics-relations"><header><Dumbbell size={18}/><div><span>СВЯЗИ</span><h2>Наблюдения, не выводы</h2></div></header>{relationReady ? <p>В дни с тренировкой энергия в среднем <strong>{(avg(trainingEnergy)! - avg(restEnergy)!).toFixed(1)}</strong> пункта {avg(trainingEnergy)! >= avg(restEnergy)! ? "выше" : "ниже"}.</p> : <div className="analytics-empty"><TrendingUp size={18}/><p>Нужно ещё <strong>{Math.max(0, 5 - trainingEnergy.length)}</strong> дней с тренировкой и оценкой энергии, чтобы показывать первую связь.</p></div>}<small>Показываем закономерности только от 5 совпадений в каждой группе.</small></section>
      <section className="analytics-chart"><header><div><span>ДИНАМИКА</span><h2>{range} дней</h2></div><div>{(["sleep", "energy", "weight"] as const).map((v) => <button className={metric === v ? "active" : ""} key={v} onClick={() => setMetric(v)}>{v === "sleep" ? "Сон" : v === "energy" ? "Энергия" : "Вес"}</button>)}</div></header>{filled ? <div className="analytics-bars">{points.map((point) => <i key={point.day} title={`${point.day}: ${point.value ?? "нет данных"}`} style={{ height: `${point.value ? Math.max(5, point.value / max * 100) : 2}%` }} />)}</div> : <div className="analytics-chart-empty"><MoonStar size={20}/><p>Здесь появится график, когда будут реальные отметки.</p></div>}<footer><span>{range === 90 ? "90 дней назад" : "30 дней назад"}</span><strong>{metric === "sleep" ? "часы сна" : metric === "energy" ? "оценка /10" : "кг"}</strong><span>сегодня</span></footer></section></div>
    <p className="analytics-note"><BarChart3 size={15}/>{demo ? "Демо-режим: данные существуют только на этой странице и не сохраняются." : "Сон пока анализируется из трекера в этом устройстве; остальные отметки — из защищённой базы данных."}</p></section>;
}
