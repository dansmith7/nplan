import * as React from "react";
import { BedDouble, Check, MoonStar, Pencil, Plus, Sunrise, Trash2 } from "lucide-react";
import "./planner-sleep-screen.css";

type Mood = "Бодро" | "Нормально" | "Тяжело" | "Разбит";
type Entry = { id: string; date: string; bedtime: string; wakeTime: string; mood: Mood; note?: string };
const entriesKey = "nplan-sleep-entries";
const draftKey = "nplan-sleep-draft";
const moods: Array<{ value: Mood; mark: string }> = [
  { value: "Бодро", mark: "✦" }, { value: "Нормально", mark: "○" },
  { value: "Тяжело", mark: "◔" }, { value: "Разбит", mark: "—" },
];
const todayKey = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const nowTime = () => new Date().toTimeString().slice(0, 5);
function duration(bedtime: string, wakeTime: string) {
  const [bh = 0, bm = 0] = bedtime.split(":").map(Number);
  const [wh = 0, wm = 0] = wakeTime.split(":").map(Number);
  const start = bh * 60 + bm;
  let end = wh * 60 + wm;
  if (end <= start) end += 1440;
  return end - start;
}
function durationLabel(minutes: number) {
  return String(Math.floor(minutes / 60)) + " ч " + String(minutes % 60).padStart(2, "0") + " мин";
}
function mark(mood: Mood) { return moods.find((item) => item.value === mood)?.mark ?? "○"; }
function readEntries(): Entry[] {
  try { const value = JSON.parse(localStorage.getItem(entriesKey) ?? "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

export function PlannerSleepScreen() {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [draft, setDraft] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Entry | null | undefined>(undefined);
  React.useEffect(() => {
    setEntries(readEntries());
    setDraft(localStorage.getItem(draftKey));
  }, []);
  const sorted = React.useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const today = entries.find((entry) => entry.date === todayKey());
  const recent = sorted.slice(0, 7);
  const average = recent.length
    ? durationLabel(Math.round(recent.reduce((sum, entry) => sum + duration(entry.bedtime, entry.wakeTime), 0) / recent.length))
    : null;
  const save = (entry: Entry) => {
    const next = [...entries.filter((item) => item.id !== entry.id && item.date !== entry.date), entry];
    setEntries(next); localStorage.setItem(entriesKey, JSON.stringify(next));
    localStorage.removeItem(draftKey); setDraft(null); setEditing(undefined);
  };
  const startNight = () => { const value = nowTime(); localStorage.setItem(draftKey, value); setDraft(value); };
  const remove = (id: string) => { const next = entries.filter((entry) => entry.id !== id); setEntries(next); localStorage.setItem(entriesKey, JSON.stringify(next)); };
  return (
    <section className="sleep-screen">
      <header className="sleep-heading"><div><span>ЛИЧНАЯ ИСТОРИЯ</span><h1>Сон.</h1><p>Не оценка и не стрик — просто память о твоём ритме.</p></div>
        {draft ? <button className="sleep-primary" onClick={() => setEditing(null)}><Sunrise size={16} />Записать утро</button> : <button className="sleep-secondary" onClick={() => setEditing(null)}><Plus size={16} />Добавить ночь</button>}
      </header>
      <div className="sleep-overview">
        <article className="sleep-today"><MoonStar size={144} aria-hidden="true" /><span>СЕГОДНЯШНЯЯ НОЧЬ</span>
          {today ? <div className="sleep-today-data"><div><strong>{durationLabel(duration(today.bedtime, today.wakeTime))}</strong><p>{today.bedtime} — {today.wakeTime}</p></div><button onClick={() => setEditing(today)}><b>{mark(today.mood)}</b>{today.mood}<Pencil size={13} /></button></div>
          : draft ? <div className="sleep-today-data"><div><strong>Ночь началась в {draft}</strong><p>Утром добавь время подъёма и своё самочувствие.</p></div></div>
          : <div className="sleep-today-data"><div><strong>Ночь ещё не отмечена</strong><p>Вечером зафиксируй начало сна. Утром заверши запись.</p></div><button className="sleep-primary" onClick={startNight}><BedDouble size={16} />Начать ночь</button></div>}
        </article>
        <article className="sleep-average"><span>ПОСЛЕДНИЕ 7 ЗАПИСЕЙ</span><strong>{average ?? "—"}</strong><p>{recent.length ? "средняя длительность по " + String(recent.length) + " ночам" : "появится после первой записи"}</p>{recent.length ? <small>Ориентир для тебя, не норма и не оценка.</small> : null}</article>
      </div>
      {editing !== undefined ? <SleepForm entry={editing} draft={draft} onSave={save} onClose={() => setEditing(undefined)} /> : null}
      <section className="sleep-history"><header><div><span>БАЗА НАБЛЮДЕНИЙ</span><h2>Ночи</h2></div><p>{entries.length ? String(entries.length) + " записей" : "Начни с одной ночи"}</p></header>
        {sorted.length ? <div className="sleep-list">{sorted.map((entry) => <article key={entry.id}><b>{mark(entry.mood)}</b><button onClick={() => setEditing(entry)}><strong>{entry.date === todayKey() ? "Сегодня" : entry.date}</strong><span>{entry.bedtime} — {entry.wakeTime}{entry.note ? " · " + entry.note : ""}</span></button><div><strong>{durationLabel(duration(entry.bedtime, entry.wakeTime))}</strong><span>{entry.mood}</span></div><button className="sleep-delete" aria-label="Удалить запись" onClick={() => remove(entry.id)}><Trash2 size={15} /></button></article>)}</div>
        : <button className="sleep-empty" onClick={() => setEditing(null)}><MoonStar size={20} /><span><strong>Первая запись</strong>Добавь сегодняшнюю ночь — это займёт несколько секунд.</span></button>}
      </section>
    </section>
  );
}

function SleepForm({ entry, draft, onSave, onClose }: { entry: Entry | null; draft: string | null; onSave: (entry: Entry) => void; onClose: () => void }) {
  const [date, setDate] = React.useState(entry?.date ?? todayKey());
  const [bedtime, setBedtime] = React.useState(entry?.bedtime ?? draft ?? "23:30");
  const [wakeTime, setWakeTime] = React.useState(entry?.wakeTime ?? nowTime());
  const [mood, setMood] = React.useState<Mood>(entry?.mood ?? "Нормально");
  const [note, setNote] = React.useState(entry?.note ?? "");
  return <section className="sleep-form"><header><div><span>{entry ? "РЕДАКТИРОВАНИЕ" : draft ? "ДОБРОЕ УТРО" : "НОВАЯ ЗАПИСЬ"}</span><h2>{entry ? "Ночь" : "Как спалось?"}</h2></div><button onClick={onClose}>Закрыть</button></header>
    <div className="sleep-time-fields"><label>День пробуждения<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Лёг спать<input type="time" value={bedtime} onChange={(event) => setBedtime(event.target.value)} /></label><label>Проснулся<input type="time" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} /></label><div><span>Длительность</span><strong>{durationLabel(duration(bedtime, wakeTime))}</strong></div></div>
    <p className="sleep-form-label">Как ощущается утро?</p><div className="sleep-moods">{moods.map((item) => <button key={item.value} className={mood === item.value ? "selected" : ""} onClick={() => setMood(item.value)}><b>{item.mark}</b><span>{item.value}</span></button>)}</div>
    <label className="sleep-note">Одна заметка — необязательно<textarea value={note} maxLength={240} onChange={(event) => setNote(event.target.value)} placeholder="Например: поздно лёг, но утром спокойно" /></label>
    <footer><button onClick={onClose}>Отмена</button><button className="sleep-primary" onClick={() => onSave({ id: entry?.id ?? crypto.randomUUID(), date, bedtime, wakeTime, mood, note: note.trim() || undefined })}><Check size={16} />Сохранить ночь</button></footer>
  </section>;
}
