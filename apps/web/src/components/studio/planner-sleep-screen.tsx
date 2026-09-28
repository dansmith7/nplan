import * as React from "react";
import { Check, ChevronRight, MoonStar, Pencil, Plus, Sunrise, Trash2 } from "lucide-react";
import "./planner-sleep-screen.css";

type Mood = "Отличное" | "Хорошее" | "Спокойное" | "Тяжёлое" | "Плохое";
type DayReport = { energy: number; sleepiness: number; clarity: number; mood: number };
type Entry = { id: string; date: string; bedtime: string; wakeTime: string; awakenings: number; mood?: Mood; dayReport?: DayReport };
const entriesKey = "nplan-sleep-entries";
const moods: Array<{ value: Mood; mark: string }> = [
  { value: "Отличное", mark: "✦" }, { value: "Хорошее", mark: "●" }, { value: "Спокойное", mark: "○" },
  { value: "Тяжёлое", mark: "◔" }, { value: "Плохое", mark: "—" },
];
const reportMetrics: Array<{ key: keyof DayReport; label: string; low: string; high: string }> = [
  { key: "energy", label: "Энергия", low: "нет сил", high: "много сил" },
  { key: "sleepiness", label: "Сонливость", low: "бодро", high: "клонит в сон" },
  { key: "clarity", label: "Ясность", low: "туманно", high: "собранно" },
  { key: "mood", label: "Настроение", low: "тяжело", high: "хорошо" },
];
const defaultReport: DayReport = { energy: 6, sleepiness: 4, clarity: 6, mood: 6 };
const todayKey = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };
const nowTime = () => new Date().toTimeString().slice(0, 5);
function duration(bedtime: string, wakeTime: string) {
  const [bh = 0, bm = 0] = bedtime.split(":").map(Number); const [wh = 0, wm = 0] = wakeTime.split(":").map(Number);
  const start = bh * 60 + bm; let end = wh * 60 + wm; if (end <= start) end += 1440; return end - start;
}
function durationLabel(minutes: number) { return String(Math.floor(minutes / 60)) + " ч " + String(minutes % 60).padStart(2, "0") + " мин"; }
function shortDuration(minutes: number) { return String(Math.floor(minutes / 60)) + "ч " + String(minutes % 60).padStart(2, "0") + "м"; }
function moodMark(mood?: Mood) { return moods.find((item) => item.value === mood)?.mark ?? "○"; }
function isScore(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10; }
function readDayReport(value: unknown): DayReport | undefined {
  if (!value || typeof value !== "object") return undefined;
  const report = value as Partial<DayReport>;
  return isScore(report.energy) && isScore(report.sleepiness) && isScore(report.clarity) && isScore(report.mood)
    ? { energy: report.energy, sleepiness: report.sleepiness, clarity: report.clarity, mood: report.mood }
    : undefined;
}
function readEntries(): Entry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(entriesKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Partial<Entry> => Boolean(item && typeof item === "object"))
      .filter((item) => Boolean(item.id && item.date && item.bedtime && item.wakeTime))
      .map((item) => ({ id: item.id as string, date: item.date as string, bedtime: item.bedtime as string, wakeTime: item.wakeTime as string,
        awakenings: typeof item.awakenings === "number" ? item.awakenings : 0,
        mood: moods.some((mood) => mood.value === item.mood) ? item.mood as Mood : undefined,
        dayReport: readDayReport(item.dayReport) }));
  } catch { return []; }
}
function dateFromOffset(offset: number) { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); }
function demoEntries(): Entry[] {
  return [
    { id: "sleep-demo-previous", date: dateFromOffset(-1), bedtime: "00:10", wakeTime: "07:05", awakenings: 2, dayReport: { energy: 3, sleepiness: 8, clarity: 4, mood: 3 } },
    { id: "sleep-demo-current", date: todayKey(), bedtime: "23:45", wakeTime: "07:20", awakenings: 1 },
  ];
}
function weekday(date: string) { return new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(new Date(date + "T12:00:00")).slice(0, 2).toUpperCase(); }
function timingMinutes(entry: Entry) { const [hours = 0, minutes = 0] = entry.bedtime.split(":").map(Number); const value = hours * 60 + minutes; return value < 12 * 60 ? value + 1440 : value; }
function nightIndex(entry: Entry, history: Entry[]) {
  const minutes = duration(entry.bedtime, entry.wakeTime);
  const durationScore = minutes >= 420 ? 100 : Math.max(0, Math.round((minutes / 420) * 100));
  const others = history.filter((item) => item.id !== entry.id).slice(0, 6);
  const averageTiming = others.length ? others.reduce((sum, item) => sum + timingMinutes(item), 0) / others.length : timingMinutes(entry);
  const timingScore = Math.max(0, Math.round(100 - Math.abs(timingMinutes(entry) - averageTiming) / 1.2));
  const awakeningsScore = [100, 85, 68, 52, 40][Math.min(entry.awakenings, 4)] ?? 40;
  return Math.round(durationScore * 0.6 + timingScore * 0.25 + awakeningsScore * 0.15);
}
function dayScore(report: DayReport) {
  return Math.round((report.energy + (11 - report.sleepiness) + report.clarity + report.mood) * 2.5);
}
function indexFor(entry: Entry, history: Entry[]) {
  const nightly = nightIndex(entry, history);
  return entry.dayReport ? Math.round(nightly * 0.7 + dayScore(entry.dayReport) * 0.3) : nightly;
}

export function PlannerSleepScreen() {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [editing, setEditing] = React.useState<Entry | null | undefined>(undefined);
  React.useEffect(() => {
    const existing = readEntries();
    const shouldShowDemo = new URLSearchParams(window.location.search).has("sleep-demo");
    const next = shouldShowDemo && !existing.length ? demoEntries() : existing;
    if (next !== existing) localStorage.setItem(entriesKey, JSON.stringify(next));
    setEntries(next);
  }, []);
  const sorted = React.useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const today = entries.find((entry) => entry.date === todayKey());
  const week = React.useMemo(() => Array.from({ length: 7 }, (_, index) => dateFromOffset(index - 6)), []);
  const weeklyEntries = week.map((date) => entries.find((entry) => entry.date === date));
  const recent = sorted.slice(0, 7);
  const average = recent.length ? Math.round(recent.reduce((sum, entry) => sum + duration(entry.bedtime, entry.wakeTime), 0) / recent.length) : null;
  const current = today ?? sorted[0]; const currentIndex = current ? indexFor(current, sorted) : null;
  const latestReported = sorted.find((entry) => entry.dayReport);
  const previousEntry = entries.find((entry) => entry.date === dateFromOffset(-1));
  const save = (entry: Entry, reportForPrevious?: DayReport) => {
    let next = [...entries.filter((item) => item.id !== entry.id && item.date !== entry.date), entry];
    if (reportForPrevious && previousEntry) {
      next = next.map((item) => item.id === previousEntry.id ? { ...item, dayReport: reportForPrevious } : item);
    }
    setEntries(next); localStorage.setItem(entriesKey, JSON.stringify(next)); setEditing(undefined); window.dispatchEvent(new Event("nplan-sleep-entry-changed"));
  };
  const remove = (id: string) => { const next = entries.filter((entry) => entry.id !== id); setEntries(next); localStorage.setItem(entriesKey, JSON.stringify(next)); window.dispatchEvent(new Event("nplan-sleep-entry-changed")); };
  const advice = !current ? "Первая запись займёт меньше минуты — завтра будет с чем сравнить."
    : duration(current.bedtime, current.wakeTime) < 420 ? "Сегодня меньше 7 часов. Это мягкий ориентир для взрослых, а не диагноз."
    : current.awakenings >= 3 ? "Было несколько пробуждений. Просто отметь это и посмотри на картину за неделю."
    : "Ритм выглядит ровным. Смотри на динамику, а не на один идеальный балл.";
  return <section className="sleep-screen">
    <header className="sleep-heading"><div><span>ЛИЧНАЯ ИСТОРИЯ</span><h1>Сон.</h1><p>Одно утреннее касание — и ритм становится видимым.</p></div>
      <button className="sleep-primary" onClick={() => setEditing(today ?? null)}>{today ? <Pencil size={16} /> : <Sunrise size={16} />}{today ? "Изменить запись" : "Отметить сон"}</button></header>
    <section className="sleep-index-card"><div className="sleep-index-copy"><span>ИНДЕКС ПРИВЫЧКИ СНА</span><strong>{currentIndex ?? "—"}</strong><p>{current ? "за последнюю отмеченную ночь" : "появится после первой записи"}</p></div>
      <div className="sleep-week-chart" aria-label="Индекс привычки сна за неделю"><div className="sleep-chart-grid" aria-hidden="true"><i /><i /><i /></div><div className="sleep-bars">{weeklyEntries.map((entry, index) => {
        const score = entry ? indexFor(entry, sorted) : 0; const isToday = week[index] === todayKey();
        return <div className="sleep-bar-item" key={week[index]}>{entry ? <b>{score}</b> : null}<div className={"sleep-bar " + (isToday ? "today" : "")} style={{ height: Math.max(entry ? 18 : 3, score) + "%" }} /><span>{weekday(week[index]!)}</span></div>;
      })}</div></div></section>
    <section className="sleep-stat-grid">
      <article><span>СОН ЗА НОЧЬ</span><strong>{current ? shortDuration(duration(current.bedtime, current.wakeTime)) : "—"}</strong><p>{current ? current.bedtime + " — " + current.wakeTime : "отметь время сна и подъёма"}</p></article>
      <article><span>СРЕДНЕЕ ЗА НЕДЕЛЮ</span><strong>{average ? shortDuration(average) : "—"}</strong><p>{recent.length ? "по " + String(recent.length) + " ночам" : "появится после записей"}</p></article>
      <article><span>ПРОБУЖДЕНИЯ</span><strong>{current ? String(current.awakenings) : "—"}</strong><p>{current ? "за последнюю ночь" : "необязательное поле"}</p></article>
      <article className="sleep-mood-card"><span>ДНЕВНАЯ ОЦЕНКА</span><strong>{latestReported?.dayReport ? String(dayScore(latestReported.dayReport)) : "—"}</strong><p>{latestReported?.dayReport ? "за " + new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(latestReported.date + "T12:00:00")) : "появится на следующий день"}</p></article>
    </section>
    {latestReported?.dayReport ? <section className="sleep-day-scale"><header><div><span>КАК ПРОШЁЛ ДЕНЬ ПОСЛЕ СНА</span><h2>{new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date(latestReported.date + "T12:00:00"))}</h2></div><p>Итог ночи: <strong>{indexFor(latestReported, sorted)}</strong> <em>{nightIndex(latestReported, sorted)} ночью</em></p></header><div className="sleep-metric-grid">{reportMetrics.map((metric) => { const value = latestReported.dayReport![metric.key]; return <article key={metric.key}><div><span>{metric.label}</span><strong>{value}</strong></div><div className="sleep-meter"><i style={{ width: String(value * 10) + "%" }} /></div><footer><small>{metric.low}</small><small>{metric.high}</small></footer></article>; })}</div></section> : null}
    <section className="sleep-insight"><MoonStar size={18} /><div><span>НАБЛЮДЕНИЕ</span><p>{advice}</p></div><ChevronRight size={17} aria-hidden="true" /></section>
    <section className="sleep-history"><header><div><span>БАЗА НАБЛЮДЕНИЙ</span><h2>Ночи</h2></div><p>{entries.length ? String(entries.length) + " записей" : "без серий и давления"}</p></header>
      {sorted.length ? <div className="sleep-list">{sorted.map((entry) => <article key={entry.id}><b>{entry.dayReport ? String(indexFor(entry, sorted)) : moodMark(entry.mood)}</b><button onClick={() => setEditing(entry)}><strong>{entry.date === todayKey() ? "Сегодня" : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(entry.date + "T12:00:00"))}</strong><span>{entry.bedtime} — {entry.wakeTime} · {entry.awakenings ? String(entry.awakenings) + " пробужд." : "без пробуждений"}</span></button><div><strong>{durationLabel(duration(entry.bedtime, entry.wakeTime))}</strong><span>{entry.dayReport ? "день: " + String(dayScore(entry.dayReport)) + "/100" : "ждёт отчёта дня"}</span></div><button className="sleep-delete" aria-label="Удалить запись" onClick={() => remove(entry.id)}><Trash2 size={15} /></button></article>)}</div>
        : <button className="sleep-empty" onClick={() => setEditing(null)}><Plus size={19} /><span><strong>Отметить первую ночь</strong>Время сна, подъёма и одно касание про самочувствие.</span></button>}
    </section>
    <p className="sleep-method-note">Индекс — личный ориентир из длительности, регулярности и пробуждений; он не измеряет фазы сна и не заменяет медицинскую оценку.</p>
    {editing !== undefined ? <SleepForm entry={editing} previousEntry={editing ? undefined : previousEntry} onSave={save} onClose={() => setEditing(undefined)} /> : null}
  </section>;
}

function SleepForm({ entry, previousEntry, onSave, onClose }: { entry: Entry | null; previousEntry?: Entry; onSave: (entry: Entry, reportForPrevious?: DayReport) => void; onClose: () => void }) {
  const [date, setDate] = React.useState(entry?.date ?? todayKey()); const [bedtime, setBedtime] = React.useState(entry?.bedtime ?? "23:30");
  const [wakeTime, setWakeTime] = React.useState(entry?.wakeTime ?? nowTime()); const [awakenings, setAwakenings] = React.useState(entry?.awakenings ?? 0);
  const [report, setReport] = React.useState<DayReport>(previousEntry?.dayReport ?? defaultReport);
  return <section className="sleep-form" role="dialog" aria-modal="true" aria-label="Отметить сон"><header><div><span>{entry ? "РЕДАКТИРОВАНИЕ" : "ДОБРОЕ УТРО"}</span><h2>{entry ? "Ночь" : "Как спалось?"}</h2></div><button onClick={onClose}>Закрыть</button></header>
    <p className="sleep-form-intro">Достаточно времени, когда лёг и когда проснулся. Остальное — по желанию.</p><div className="sleep-time-fields"><label>День подъёма<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Лёг спать<input type="time" value={bedtime} onChange={(event) => setBedtime(event.target.value)} /></label><label>Проснулся<input type="time" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} /></label><div><span>По отметкам</span><strong>{durationLabel(duration(bedtime, wakeTime))}</strong></div></div>
    <p className="sleep-form-label">Сколько раз просыпался?</p><div className="sleep-choice-row">{[0, 1, 2, 3, 4].map((value) => <button key={value} className={awakenings === value ? "selected" : ""} onClick={() => setAwakenings(value)}>{value === 4 ? "4+" : value}</button>)}</div>
    {previousEntry ? <section className="sleep-day-report"><header><div><span>ВЧЕРАШНИЙ ДЕНЬ</span><h3>Как он прошёл?</h3></div><p>Уточнит индекс ночи {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(previousEntry.date + "T12:00:00"))}</p></header><div className="sleep-slider-list">{reportMetrics.map((metric) => <label key={metric.key}><div><span>{metric.label}</span><strong>{report[metric.key]}<small>/10</small></strong></div><input type="range" min="1" max="10" value={report[metric.key]} onChange={(event) => setReport((current) => ({ ...current, [metric.key]: Number(event.target.value) }))} aria-label={metric.label} /><footer><small>{metric.low}</small><small>{metric.high}</small></footer></label>)}</div></section> : null}
    <footer><button onClick={onClose}>Отмена</button><button className="sleep-primary" onClick={() => onSave({ id: entry?.id ?? crypto.randomUUID(), date, bedtime, wakeTime, awakenings, mood: entry?.mood }, previousEntry ? report : undefined)}><Check size={16} />Сохранить</button></footer>
  </section>;
}
