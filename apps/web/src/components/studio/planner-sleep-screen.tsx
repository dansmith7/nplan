import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronRight, MoonStar, Pencil, Plus, Sunrise, Trash2 } from "lucide-react";
import "./planner-sleep-screen.css";
import "./planner-sleep-chart.css";
import { usePlannerSleepEntries, type PlannerSleepEntry as Entry, type SleepReport as DayReport } from "@/hooks/use-planner-sleep-entries";
import { dayScore, estimatedSleepMinutes, sleepDurationMinutes, sleepIndex, sleepIndexBreakdown, sleepIndexWeights } from "./planner-sleep-index";

const entriesKey = "nplan-sleep-entries";
const reportMetrics: Array<{ key: keyof DayReport; label: string; low: string; high: string }> = [
  { key: "energy", label: "Энергия", low: "нет сил", high: "много сил" },
  { key: "sleepiness", label: "Сонливость", low: "бодро", high: "клонит в сон" },
  { key: "clarity", label: "Ясность", low: "туманно", high: "собранно" },
  { key: "mood", label: "Настроение", low: "тяжело", high: "хорошо" },
];
const defaultReport: DayReport = { energy: 6, sleepiness: 4, clarity: 6, mood: 6 };
const todayKey = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };
const nowTime = () => new Date().toTimeString().slice(0, 5);
function durationLabel(minutes: number) { return String(Math.floor(minutes / 60)) + " ч " + String(minutes % 60).padStart(2, "0") + " мин"; }
function shortDuration(minutes: number) { return String(Math.floor(minutes / 60)) + "ч " + String(minutes % 60).padStart(2, "0") + "м"; }
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
        awakenings: typeof item.awakenings === "number" ? item.awakenings : null,
        dayReport: readDayReport(item.dayReport) }));
  } catch { return []; }
}
function dateFromOffset(offset: number) { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); }
function weekday(date: string) { return new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(new Date(date + "T12:00:00")).slice(0, 2).toUpperCase(); }
export function PlannerSleepScreen() {
  const sleepStore = usePlannerSleepEntries();
  const [editing, setEditing] = React.useState<Entry | null | undefined>(undefined);
  const [ratingDay, setRatingDay] = React.useState<Entry>();
  const imported = React.useRef(false);
  React.useEffect(() => {
    if (imported.current || !sleepStore.data) return;
    imported.current = true;
    const remoteDays = new Set(sleepStore.data.map((entry) => entry.date));
    const missing = readEntries().filter((entry) => !remoteDays.has(entry.date));
    if (missing.length) {
      void Promise.all(missing.map((entry) => sleepStore.save.mutateAsync({ entry, importReport: true })))
        .then(() => localStorage.removeItem(entriesKey))
        .catch(() => { /* Keep the local records for retry on the next visit. */ });
    }
  }, [sleepStore.data, sleepStore.save]);
  const entries = sleepStore.data ?? [];
  const sorted = entries;
  const today = entries.find((entry) => entry.date === todayKey());
  const week = React.useMemo(() => Array.from({ length: 7 }, (_, index) => dateFromOffset(index - 6)), []);
  const weeklyEntries = week.map((date) => entries.find((entry) => entry.date === date));
  const weeklyScores = weeklyEntries.map((entry) => entry ? sleepIndex(entry, sorted) : null);
  const recent = sorted.slice(0, 7);
  const average = recent.length ? Math.round(recent.reduce((sum, entry) => sum + estimatedSleepMinutes(entry), 0) / recent.length) : null;
  const current = today ?? sorted[0]; const currentIndex = current ? sleepIndex(current, sorted) : null;
  const latestReported = sorted.find((entry) => entry.dayReport);
  const save = async (entry: Entry) => {
    await sleepStore.save.mutateAsync({ entry, edit: Boolean(editing) });
    setEditing(undefined);
    window.dispatchEvent(new Event("nplan-sleep-entry-changed"));
  };
  const remove = (id: string) => { void sleepStore.remove.mutateAsync(id).then(() => window.dispatchEvent(new Event("nplan-sleep-entry-changed"))); };
  const advice = !current ? "Первая запись займёт меньше минуты — завтра будет с чем сравнить."
    : estimatedSleepMinutes(current) < 420 ? "Сегодня меньше 7 часов. Это мягкий ориентир для взрослых, а не диагноз."
    : (current.awakenings ?? 0) >= 3 ? "Было несколько пробуждений. Просто отметь это и посмотри на картину за неделю."
    : "Ритм выглядит ровным. Смотри на динамику, а не на один идеальный балл.";
  return <section className="sleep-screen">
    <header className="sleep-heading"><div><span>ЛИЧНАЯ ИСТОРИЯ</span><h1>Сон.</h1><p>Одно утреннее касание — и ритм становится видимым.</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="sleep-primary" style={{ background: "transparent", border: "1px solid #5a5347", color: "#e7dcc9" }} onClick={() => setEditing(null)}><Plus size={16} />Добавить ночь</button>{today ? <button className="sleep-primary" onClick={() => setEditing(today)}><Pencil size={16} />Изменить запись</button> : <button className="sleep-primary" onClick={() => setEditing(null)}><Sunrise size={16} />Отметить сон</button>}</div></header>
    <section className="sleep-index-card"><div className="sleep-index-copy"><span>ИНДЕКС СНА</span><strong>{currentIndex ?? "—"}</strong><p>{current ? "за последнюю отмеченную ночь" : "появится после первой записи"}</p></div>
      <div className="sleep-week-chart" aria-label="Индекс сна за неделю">
        <div className="sleep-chart-plot">
          <div className="sleep-chart-grid" aria-hidden="true"><i /><i /><i /></div>
          <svg className="sleep-chart-line" viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true">
            {weeklyScores.slice(1).map((score, index) => {
              const previous = weeklyScores[index] ?? null;
              if (score === null || previous === null) return null;
              return <line key={week[index + 1]} x1={(index / 6) * 600} y1={100 - previous} x2={((index + 1) / 6) * 600} y2={100 - score} />;
            })}
          </svg>
          {weeklyScores.map((score, index) => {
            const isToday = week[index] === todayKey();
            return score === null ? null : <div className={"sleep-chart-point " + (isToday ? "today" : "")} key={week[index]} style={{ left: String((index / 6) * 100) + "%", bottom: String(score) + "%" }}><b>{score}</b><i /></div>;
          })}
        </div>
        <div className="sleep-chart-labels">{week.map((date) => <span key={date}>{weekday(date)}</span>)}</div>
      </div></section>
    <section className="sleep-stat-grid">
      <article><span>ДЛИТЕЛЬНОСТЬ ПО ЗАПИСИ</span><strong>{current ? shortDuration(estimatedSleepMinutes(current)) : "—"}</strong><p>{current ? current.bedtime + " — " + current.wakeTime : "отметь время сна и подъёма"}</p></article>
      <article><span>СРЕДНЕЕ ЗА НЕДЕЛЮ</span><strong>{average ? shortDuration(average) : "—"}</strong><p>{recent.length ? "по " + String(recent.length) + " ночам" : "появится после записей"}</p></article>
      <article><span>ПРОБУЖДЕНИЯ</span><strong>{current?.awakenings ?? "—"}</strong><p>{current?.awakenings != null ? "за последнюю ночь" : "можно пропустить"}</p></article>
      <article className="sleep-mood-card"><span>ИНДЕКС ДНЯ</span><strong>{latestReported?.dayReport ? String(dayScore(latestReported.dayReport)) : "—"}</strong><p>{latestReported?.dayReport ? "за " + new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(latestReported.date + "T12:00:00")) : "появится после оценки дня"}</p></article>
    </section>
    {latestReported?.dayReport ? <section className="sleep-day-scale"><header><div><span>КАК ПРОШЁЛ ДЕНЬ ПОСЛЕ СНА</span><h2>{new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date(latestReported.date + "T12:00:00"))}</h2></div><p>Индекс дня <strong>{dayScore(latestReported.dayReport)}/100</strong></p></header><div className="sleep-metric-grid">{reportMetrics.map((metric) => { const value = latestReported.dayReport![metric.key]; return <article key={metric.key}><div><span>{metric.label}</span><strong>{value}</strong></div><div className="sleep-meter"><i style={{ width: String(value * 10) + "%" }} /></div><footer><small>{metric.low}</small><small>{metric.high}</small></footer></article>; })}</div></section> : null}
    <section className="sleep-insight"><MoonStar size={18} /><div><span>НАБЛЮДЕНИЕ</span><p>{advice}</p></div><ChevronRight size={17} aria-hidden="true" /></section>
    <section className="sleep-history"><header><div><span>БАЗА НАБЛЮДЕНИЙ</span><h2>Ночи</h2></div><p>{entries.length ? String(entries.length) + " записей" : "без серий и давления"}</p></header>
      {sorted.length ? <div className="sleep-list">{sorted.map((entry) => <article key={entry.id}><b>{sleepIndex(entry, sorted)}</b><button onClick={() => setEditing(entry)}><strong>{entry.date === todayKey() ? "Сегодня" : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(entry.date + "T12:00:00"))}</strong><span>{entry.bedtime} — {entry.wakeTime} · {entry.awakenings == null ? "пробуждения не отмечены" : entry.awakenings + " пробужд."}</span></button><div><strong>{durationLabel(estimatedSleepMinutes(entry))}</strong></div><button className="sleep-rate-day" onClick={() => setRatingDay(entry)}>{entry.dayReport ? `День ${dayScore(entry.dayReport)}/100` : "Оценить день"}</button><button className="sleep-delete" aria-label="Удалить запись" onClick={() => remove(entry.id)}><Trash2 size={15} /></button></article>)}</div>
        : <button className="sleep-empty" onClick={() => setEditing(null)}><Plus size={19} /><span><strong>Отметить первую ночь</strong>Достаточно времени отбоя и подъёма.</span></button>}
    </section>
    <p className="sleep-method-note">Индекс сна учитывает длительность ({sleepIndexWeights.duration}%), пробуждения ({sleepIndexWeights.awakenings}%) и регулярность отбоя ({sleepIndexWeights.timing}%). Регулярность сравниваем с предыдущими 14 днями. Серия ночей короче 7 часов снижает балл. Индекс дня считается отдельно.</p>
    {editing !== undefined ? <SleepForm entry={editing} history={entries} onSave={save} onClose={() => setEditing(undefined)} /> : null}
    {ratingDay ? <DayForm entry={ratingDay} onClose={() => setRatingDay(undefined)} onSave={async (report) => {
      await sleepStore.saveDay.mutateAsync({ id: ratingDay.id, report });
      setRatingDay(undefined);
      window.dispatchEvent(new Event("nplan-sleep-entry-changed"));
    }} /> : null}
  </section>;
}

function EntryDialog({ title, description, submitLabel, onClose, onSave, children }: {
  title: string;
  description: string;
  submitLabel: string;
  onClose: () => void;
  onSave: () => Promise<void>;
  children: React.ReactNode;
}) {
  const trigger = React.useRef<HTMLElement | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);
  const close = () => { if (!saving) onClose(); };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="sleep-form-backdrop" />
        <Dialog.Content
          className="sleep-form"
          onOpenAutoFocus={() => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus({ preventScroll: true }); }}
        >
          <header><Dialog.Title asChild><h2>{title}</h2></Dialog.Title><button type="button" onClick={close} disabled={saving}>Закрыть</button></header>
          <Dialog.Description className="sleep-form-intro">{description}</Dialog.Description>
          <form onSubmit={async (event) => {
            event.preventDefault();
            if (saving) return;
            setSaving(true);
            setError(false);
            try { await onSave(); } catch { setError(true); setSaving(false); }
          }}>
            {children}
            {error && <p role="alert">Не удалось сохранить. Проверь запись и попробуй ещё раз.</p>}
            <footer>
              <button type="button" onClick={close} disabled={saving}>Отмена</button>
              <button className="sleep-primary" type="submit" disabled={saving}><Check size={16} />{saving ? "Сохраняем…" : submitLabel}</button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const points = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

function SleepForm({ entry, history, onSave, onClose }: {
  entry: Entry | null;
  history: Entry[];
  onSave: (entry: Entry) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = React.useState(entry?.date ?? todayKey());
  const [bedtime, setBedtime] = React.useState(entry?.bedtime ?? "23:30");
  const [wakeTime, setWakeTime] = React.useState(entry?.wakeTime ?? nowTime());
  const [awakenings, setAwakenings] = React.useState(entry?.awakenings ?? null);
  const [awakeInput, setAwakeInput] = React.useState(entry?.awakeMinutes?.toString() ?? "");
  const awakeMinutes = awakeInput === "" ? null : Number(awakeInput);
  const interval = bedtime && wakeTime ? sleepDurationMinutes(bedtime, wakeTime) : null;
  const validAwakeMinutes = awakeMinutes === null || (
    interval !== null && Number.isInteger(awakeMinutes) && awakeMinutes >= 0 && awakeMinutes <= interval
  );
  const draft = { id: entry?.id ?? "", date, bedtime, wakeTime, awakenings, awakeMinutes };
  const preview = date && interval !== null && validAwakeMinutes ? sleepIndexBreakdown(draft, history) : null;

  return (
    <EntryDialog title="Отметить сон" description="Укажи время отбоя и подъёма. Остальные поля по желанию."
      submitLabel="Сохранить сон" onClose={onClose} onSave={() => onSave(draft)}>
      <div className="sleep-time-fields">
        <label>Дата подъёма<input type="date" value={date} required onChange={(event) => setDate(event.target.value)} /></label>
        <label>Отбой<input type="time" value={bedtime} required onChange={(event) => setBedtime(event.target.value)} /></label>
        <label>Подъём<input type="time" value={wakeTime} required onChange={(event) => setWakeTime(event.target.value)} /></label>
        <div><span>{awakeMinutes == null ? "Между отбоем и подъёмом" : "Примерно спал"}</span><strong>{preview ? durationLabel(preview.minutes) : "—"}</strong></div>
      </div>
      <fieldset className="sleep-awakening-field">
        <legend>Сколько раз просыпался?</legend>
        <div className="sleep-choice-row">
          {[0, 1, 2, 3, 4].map((value) => {
            const selected = awakenings !== null && Math.min(awakenings, 4) === value;
            return <button key={value} type="button" className={selected ? "selected" : ""} aria-pressed={selected}
              onClick={() => setAwakenings(selected ? null : value)}>{value === 4 ? "4+" : value}</button>;
          })}
        </div>
      </fieldset>
      <label className="sleep-awake-minutes">
        <span>Засыпание и ночное бодрствование, мин</span>
        <input type="number" min="0" max={interval ?? undefined} step="1" inputMode="numeric"
          value={awakeInput} onChange={(event) => setAwakeInput(event.target.value)} />
        <small>Укажи примерно, сколько минут ушло на засыпание и сколько ты бодрствовал ночью, суммарно.</small>
        {!validAwakeMinutes && <small role="alert">Укажи целое число минут в пределах времени между отбоем и подъёмом.</small>}
      </label>
      {preview && (
        <section className="sleep-score-preview" aria-label="Предварительный индекс сна" aria-live="polite">
          <strong>Индекс сна · {preview.total}/100</strong>
          <div>
            <span>Длительность {points.format(preview.duration)}/{sleepIndexWeights.duration}</span>
            <span>Пробуждения {preview.awakenings === null ? "пропущены" : `${points.format(preview.awakenings)}/${sleepIndexWeights.awakenings}`}</span>
            <span>Регулярность {preview.timing === null ? "пока без оценки" : `${points.format(preview.timing)}/${sleepIndexWeights.timing}`}</span>
          </div>
          <p>{preview.deviation === null
            ? "Для регулярности нужны пять записей за предыдущие 14 дней."
            : Math.round(preview.deviation) === 0
              ? "Отбой совпадает с твоим обычным временем."
              : `Отбой на ${durationLabel(Math.round(Math.abs(preview.deviation)))} ${preview.deviation > 0 ? "позже" : "раньше"} обычного.`}</p>
          {preview.available < 100 && <p>Базовый индекс приведён к 100 по доступным показателям.</p>}
          {preview.shortNights.penalty > 0 && <p>−{points.format(preview.shortNights.penalty)} за серию коротких ночей ({preview.shortNights.nights + 1} подряд).</p>}
        </section>
      )}
    </EntryDialog>
  );
}

function DayForm({ entry, onSave, onClose }: { entry: Entry; onSave: (report: DayReport) => Promise<void>; onClose: () => void }) {
  const [report, setReport] = React.useState(entry.dayReport ?? defaultReport);
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(entry.date + "T12:00:00"));
  return (
    <EntryDialog title="Оценить день" description={date} submitLabel="Сохранить оценку" onClose={onClose} onSave={() => onSave(report)}>
      <div className="sleep-slider-list">{reportMetrics.map((metric) => (
        <label key={metric.key}>
          <div><span>{metric.label}</span><strong>{report[metric.key]}<small>/10</small></strong></div>
          <input type="range" min="1" max="10" value={report[metric.key]} onChange={(event) => setReport((current) => ({ ...current, [metric.key]: Number(event.target.value) }))} aria-label={metric.label} />
          <div className="sleep-slider-labels"><small>{metric.low}</small><small>{metric.high}</small></div>
        </label>
      ))}</div>
      <p className="sleep-score-preview"><strong>Индекс дня · {dayScore(report)}/100</strong></p>
    </EntryDialog>
  );
}
