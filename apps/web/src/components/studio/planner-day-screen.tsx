import * as React from "react";
import { Apple, Check, ChevronLeft, ChevronRight, Dumbbell, Heart, Scale, Sparkles, Wine } from "lucide-react";
import { type DailyCardInput, usePlannerDailyCard } from "@/hooks/use-planner-daily-card";
import "./planner-day-screen.css";

const todayKey = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const shiftDay = (day: string, offset: number) => {
  const value = new Date(`${day}T12:00:00`);
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
};
const formatDay = (day: string) => new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T12:00:00`));
const emptyCard = (day: string): DailyCardInput => ({ day, workout_type: null, workout_minutes: null, activity_note: null, had_sex: null, alcohol_units: null, cigarettes: null, ate_junk_food: null, weight_kg: null, note: null });
const parseNumber = (value: string) => value === "" ? null : Number(value);

export function PlannerDayScreen() {
  const [day, setDay] = React.useState(todayKey);
  const dailyCard = usePlannerDailyCard(day);
  const [draft, setDraft] = React.useState<DailyCardInput>(() => emptyCard(day));
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dailyCard.data) {
      setDraft(emptyCard(day));
      return;
    }
    const { id: _id, ...savedCard } = dailyCard.data;
    setDraft({ ...savedCard, day });
  }, [dailyCard.data, day]);
  const set = <K extends keyof DailyCardInput>(key: K, value: DailyCardInput[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setNotice(null);
    try { await dailyCard.save.mutateAsync(draft); setNotice("Карточка дня сохранена."); }
    catch { setNotice("Не удалось сохранить. Проверь подключение и попробуй ещё раз."); }
  };
  const isToday = day === todayKey();
  return <section className="day-screen">
    <header className="day-heading"><div><span>ЛИЧНАЯ БАЗА НАБЛЮДЕНИЙ</span><h1>День.</h1><p>Короткая запись о контексте — без оценок и серии достижений.</p></div><button className="day-save" disabled={dailyCard.save.isPending} onClick={() => void save()}><Check size={17}/>{dailyCard.save.isPending ? "Сохраняю" : "Сохранить"}</button></header>
    <nav className="day-switcher" aria-label="Выбрать день"><button aria-label="Предыдущий день" onClick={() => setDay((value) => shiftDay(value, -1))}><ChevronLeft size={18}/></button><label><span>{isToday ? "СЕГОДНЯ" : "ДЕНЬ"}</span><input type="date" value={day} onChange={(event) => setDay(event.target.value)} /><strong>{formatDay(day)}</strong></label><button aria-label="Следующий день" disabled={isToday} onClick={() => setDay((value) => shiftDay(value, 1))}><ChevronRight size={18}/></button></nav>
    <div className="day-grid">
      <section className="day-panel day-activity"><header><Dumbbell size={18}/><div><span>АКТИВНОСТЬ</span><h2>Что было в дне</h2></div></header><div className="day-fields two"><label>Тренировка<input placeholder="зал, бег, йога" value={draft.workout_type ?? ""} onChange={(event) => set("workout_type", event.target.value || null)} /></label><label>Минуты<input type="number" min="1" max="600" placeholder="—" value={draft.workout_minutes ?? ""} onChange={(event) => set("workout_minutes", parseNumber(event.target.value))} /></label></div><label className="day-full-field">Что ещё делал?<textarea placeholder="Прогулка, работа допоздна, встреча, поездка…" value={draft.activity_note ?? ""} onChange={(event) => set("activity_note", event.target.value || null)} /></label></section>
      <section className="day-panel"><header><Sparkles size={18}/><div><span>ПРИВЫЧКИ</span><h2>Без осуждения</h2></div></header><div className="day-toggle-list"><Choice label="Секс" value={draft.had_sex} onChange={(value) => set("had_sex", value)} /><Choice label="Вредная еда" value={draft.ate_junk_food} onChange={(value) => set("ate_junk_food", value)} /></div><div className="day-fields two"><label><Wine size={14}/>Алкоголь<input type="number" min="0" max="30" placeholder="порций" value={draft.alcohol_units ?? ""} onChange={(event) => set("alcohol_units", parseNumber(event.target.value))} /></label><label>Сигареты<input type="number" min="0" max="100" placeholder="шт." value={draft.cigarettes ?? ""} onChange={(event) => set("cigarettes", parseNumber(event.target.value))} /></label></div></section>
      <section className="day-panel day-body"><header><Scale size={18}/><div><span>ТЕЛО</span><h2>Один замер</h2></div></header><label className="day-weight">Вес<input type="number" min="20" max="400" step="0.1" placeholder="—" value={draft.weight_kg ?? ""} onChange={(event) => set("weight_kg", parseNumber(event.target.value))} /><small>кг</small></label><p>Необязательно измерять каждый день: график покажет только те дни, где был замер.</p></section>
      <section className="day-panel day-note"><header><Apple size={18}/><div><span>КОНТЕКСТ</span><h2>Одна мысль о дне</h2></div></header><textarea placeholder="Что повлияло на самочувствие или просто хочется запомнить?" value={draft.note ?? ""} onChange={(event) => set("note", event.target.value || null)} /></section>
    </div>
    {notice ? <p className={notice.startsWith("Не удалось") ? "day-notice error" : "day-notice"}>{notice}</p> : <p className="day-privacy"><Heart size={14}/>Эти данные видны только тебе и хранятся в твоём личном аккаунте.</p>}
  </section>;
}

function Choice({ label, value, onChange }: { label: string; value: boolean | null; onChange: (value: boolean | null) => void }) {
  return <div className="day-choice"><span>{label}</span><div><button className={value === null ? "selected" : ""} onClick={() => onChange(null)}>—</button><button className={value === false ? "selected" : ""} onClick={() => onChange(false)}>Нет</button><button className={value === true ? "selected" : ""} onClick={() => onChange(true)}>Да</button></div></div>;
}
