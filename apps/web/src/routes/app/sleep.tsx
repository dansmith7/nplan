import * as React from "react";
import {
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  MoonStar,
  Pencil,
  Plus,
  Sunrise,
  Trash2,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";
import { cn } from "@/lib/utils";

type SleepMood = "Бодро" | "Нормально" | "Тяжело" | "Разбит";

type SleepEntry = {
  id: string;
  /** Calendar day on which the user woke up. */
  date: string;
  bedtime: string;
  wakeTime: string;
  mood: SleepMood;
  note?: string;
};

type SleepDraft = { bedtime: string; startedAt: string };

const STORAGE_KEY = "nplan-sleep-entries";
const DRAFT_KEY = "nplan-sleep-draft";
const MOODS: Array<{ value: SleepMood; face: string; description: string }> = [
  { value: "Бодро", face: "✦", description: "есть энергия" },
  { value: "Нормально", face: "○", description: "обычное утро" },
  { value: "Тяжело", face: "◔", description: "хочу ещё поспать" },
  { value: "Разбит", face: "—", description: "нужен бережный день" },
];

function localDate(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}

function readEntries(): SleepEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readDraft(): SleepDraft | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    return parsed?.bedtime && parsed?.startedAt ? parsed : null;
  } catch {
    return null;
  }
}

function durationMinutes(bedtime: string, wakeTime: string) {
  const [bedHour = 0, bedMinute = 0] = bedtime.split(":").map(Number);
  const [wakeHour = 0, wakeMinute = 0] = wakeTime.split(":").map(Number);
  let start = bedHour * 60 + bedMinute;
  let end = wakeHour * 60 + wakeMinute;
  if (end <= start) end += 24 * 60;
  return end - start;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} ч ${rest.toString().padStart(2, "0")} мин`;
}

function dateLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  const today = localDate();
  const yesterday = localDate(new Date(Date.now() - 86_400_000));
  if (date === today) return "Сегодня";
  if (date === yesterday) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parsed);
}

function moodMeta(mood: SleepMood) {
  return (
    MOODS.find((item) => item.value === mood) ?? {
      value: "Нормально" as const,
      face: "○",
      description: "обычное утро",
    }
  );
}

export default function SleepPage() {
  const [entries, setEntries] = React.useState<SleepEntry[]>([]);
  const [draft, setDraft] = React.useState<SleepDraft | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SleepEntry | null>(null);

  React.useEffect(() => {
    setEntries(readEntries());
    setDraft(readDraft());
  }, []);

  const sortedEntries = React.useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries]
  );
  const todayEntry = entries.find((entry) => entry.date === localDate());
  const lastSeven = sortedEntries.slice(0, 7);
  const average = React.useMemo(() => {
    if (!lastSeven.length) return null;
    const minutes = lastSeven.reduce(
      (total, entry) => total + durationMinutes(entry.bedtime, entry.wakeTime),
      0
    );
    return formatDuration(Math.round(minutes / lastSeven.length));
  }, [lastSeven]);

  const persistEntries = React.useCallback((next: SleepEntry[]) => {
    setEntries(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const beginSleep = () => {
    const nextDraft = { bedtime: currentTime(), startedAt: new Date().toISOString() };
    setDraft(nextDraft);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(nextDraft));
  };

  const openLog = (entry?: SleepEntry) => {
    setEditing(entry ?? todayEntry ?? null);
    setDialogOpen(true);
  };

  const saveEntry = (entry: SleepEntry) => {
    const next = entries.filter((item) => item.id !== entry.id && item.date !== entry.date);
    persistEntries([...next, entry]);
    setDraft(null);
    localStorage.removeItem(DRAFT_KEY);
    setDialogOpen(false);
  };

  const deleteEntry = (id: string) => {
    persistEntries(entries.filter((entry) => entry.id !== id));
  };

  return (
    <div className="min-h-[calc(100dvh-4.75rem-env(safe-area-inset-bottom))] bg-[#11100f] text-[#f6f1e7] lg:min-h-[calc(100vh-2.75rem)]">
      <div className="mx-auto max-w-5xl px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
        <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c6b692]">Личная история</p>
            <h1 className="font-serif text-4xl tracking-[-0.035em] sm:text-5xl">Сон</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#b4afa6]">
              Отметь ночь одним жестом. Здесь нет оценок — только твой ритм и память о том, как ты себя чувствовал.
            </p>
          </div>
          {draft ? (
            <Button onClick={() => openLog()} className="bg-[#e8dac0] text-[#201d18] hover:bg-[#f3e7d0]">
              <Sunrise /> Записать утро
            </Button>
          ) : (
            <Button onClick={() => openLog()} variant="outline" className="border-[#5c554a] bg-transparent text-[#f6f1e7] hover:bg-[#26231e] hover:text-[#f6f1e7]">
              <Plus /> Добавить ночь
            </Button>
          )}
        </header>

        <section className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
          <div className="relative overflow-hidden rounded-2xl border border-[#403b33] bg-[#1a1815] p-5 sm:p-6">
            <MoonStar className="absolute -right-3 -top-4 h-36 w-36 text-[#e8dac0]/[0.07]" strokeWidth={1} />
            <div className="relative">
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#aaa094]">Сегодняшняя ночь</p>
              {todayEntry ? (
                <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-serif text-4xl tracking-tight">{formatDuration(durationMinutes(todayEntry.bedtime, todayEntry.wakeTime))}</p>
                    <p className="mt-1 text-sm text-[#aaa094]">{todayEntry.bedtime} — {todayEntry.wakeTime}</p>
                  </div>
                  <button onClick={() => openLog(todayEntry)} className="group flex items-center gap-2 rounded-lg border border-[#4b453c] px-3 py-2 text-sm text-[#d7d0c4] transition-colors hover:border-[#857967] hover:bg-[#24211c]">
                    <span className="text-lg text-[#e8dac0]">{moodMeta(todayEntry.mood).face}</span>
                    {todayEntry.mood}
                    <Pencil className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                </div>
              ) : draft ? (
                <div className="mt-5">
                  <p className="font-serif text-3xl">Ночь началась в {draft.bedtime}</p>
                  <p className="mt-2 text-sm text-[#aaa094]">Утром выбери время подъёма и самочувствие — запись появится здесь.</p>
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-serif text-3xl">Ночь ещё не отмечена</p>
                    <p className="mt-2 text-sm text-[#aaa094]">Вечером зафиксируй начало сна, а утром заверши запись.</p>
                  </div>
                  <Button onClick={beginSleep} className="bg-[#e8dac0] text-[#201d18] hover:bg-[#f3e7d0]"><BedDouble /> Начать ночь</Button>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#403b33] bg-[#e8dac0] p-5 text-[#201d18] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#716756]">Последние 7 записей</p>
            <div className="mt-6">
              <p className="font-serif text-4xl tracking-tight">{average ?? "—"}</p>
              <p className="mt-1 text-sm text-[#716756]">средняя длительность {lastSeven.length ? `по ${lastSeven.length} ночам` : "появится после первой записи"}</p>
            </div>
            {lastSeven.length > 0 && <p className="mt-7 border-t border-[#b9aa8d] pt-3 text-xs leading-5 text-[#716756]">Это ориентир для тебя, не норма и не оценка.</p>}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-2xl">Ночи</h2>
              <p className="mt-1 text-sm text-[#aaa094]">Твоя спокойная база наблюдений.</p>
            </div>
            {entries.length > 0 && <span className="text-xs text-[#aaa094]">{entries.length} {entries.length === 1 ? "запись" : "записей"}</span>}
          </div>
          {sortedEntries.length === 0 ? (
            <button onClick={() => openLog()} className="flex w-full items-center gap-4 rounded-xl border border-dashed border-[#4b453c] px-5 py-8 text-left text-[#aaa094] transition-colors hover:border-[#857967] hover:bg-[#1a1815]">
              <CircleDot className="h-5 w-5 text-[#e8dac0]" />
              <span><span className="block text-sm font-medium text-[#ddd6c9]">Первая запись</span><span className="text-xs">Добавь сегодняшнюю ночь — это займёт несколько секунд.</span></span>
            </button>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#403b33] bg-[#1a1815]">
              {sortedEntries.map((entry, index) => {
                const mood = moodMeta(entry.mood);
                return (
                  <div key={entry.id} className={cn("group flex items-center gap-3 px-4 py-3.5 sm:px-5", index > 0 && "border-t border-[#343029]")}>
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#4b453c] font-serif text-lg text-[#e8dac0]">{mood.face}</div>
                    <button onClick={() => openLog(entry)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-baseline gap-2"><span className="text-sm font-medium">{dateLabel(entry.date)}</span><span className="text-xs text-[#aaa094]">{entry.bedtime} — {entry.wakeTime}</span></div>
                      {entry.note && <p className="mt-0.5 truncate text-xs text-[#aaa094]">{entry.note}</p>}
                    </button>
                    <div className="hidden text-right sm:block"><p className="text-sm text-[#e5ded3]">{formatDuration(durationMinutes(entry.bedtime, entry.wakeTime))}</p><p className="text-xs text-[#aaa094]">{entry.mood}</p></div>
                    <button onClick={() => deleteEntry(entry.id)} aria-label={`Удалить запись за ${entry.date}`} className="grid h-8 w-8 place-items-center rounded-md text-[#80776b] opacity-0 transition-all hover:bg-[#312c25] hover:text-[#f0a18e] group-hover:opacity-100 focus:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <SleepEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editing}
        draft={draft}
        onSave={saveEntry}
      />
    </div>
  );
}

function SleepEntryDialog({ open, onOpenChange, entry, draft, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; entry: SleepEntry | null; draft: SleepDraft | null; onSave: (entry: SleepEntry) => void }) {
  const [date, setDate] = React.useState(localDate());
  const [bedtime, setBedtime] = React.useState("23:30");
  const [wakeTime, setWakeTime] = React.useState(currentTime());
  const [mood, setMood] = React.useState<SleepMood>("Нормально");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setDate(entry?.date ?? localDate());
    setBedtime(entry?.bedtime ?? draft?.bedtime ?? "23:30");
    setWakeTime(entry?.wakeTime ?? currentTime());
    setMood(entry?.mood ?? "Нормально");
    setNote(entry?.note ?? "");
  }, [open, entry, draft]);

  const minutes = durationMinutes(bedtime, wakeTime);
  const canSave = bedtime && wakeTime && minutes > 0 && minutes <= 18 * 60;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-[#4b453c] bg-[#1a1815] p-5 text-[#f6f1e7] sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{entry ? "Ночь" : draft ? "Доброе утро" : "Добавить ночь"}</DialogTitle>
          <DialogDescription className="pr-6 leading-5 text-[#aaa094]">{draft ? "Когда проснулся и как ощущается это утро?" : "Короткая запись для твоей личной истории сна."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <label className="col-span-2 text-xs text-[#aaa094]">День пробуждения<Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1.5 border-[#4b453c] bg-[#24211c] text-[#f6f1e7] [color-scheme:dark]" /></label>
          <label className="text-xs text-[#aaa094]">Лёг спать<Input type="time" value={bedtime} onChange={(event) => setBedtime(event.target.value)} className="mt-1.5 border-[#4b453c] bg-[#24211c] text-[#f6f1e7] [color-scheme:dark]" /></label>
          <label className="text-xs text-[#aaa094]">Проснулся<Input type="time" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} className="mt-1.5 border-[#4b453c] bg-[#24211c] text-[#f6f1e7] [color-scheme:dark]" /></label>
        </div>
        <div className="mt-1 rounded-lg border border-[#403b33] bg-[#24211c] px-3 py-2.5"><span className="text-xs text-[#aaa094]">Длительность</span><span className="ml-2 font-serif text-lg">{formatDuration(minutes)}</span></div>
        <div>
          <p className="mb-2 text-xs text-[#aaa094]">Как ощущается утро?</p>
          <div className="grid grid-cols-4 gap-1.5">
            {MOODS.map((item) => <button key={item.value} onClick={() => setMood(item.value)} className={cn("rounded-lg border px-1 py-2 text-center transition-colors", mood === item.value ? "border-[#e8dac0] bg-[#e8dac0] text-[#201d18]" : "border-[#4b453c] text-[#c7bfb2] hover:bg-[#24211c]")}><span className="block font-serif text-lg">{item.face}</span><span className="mt-0.5 block text-[10px]">{item.value}</span></button>)}
          </div>
        </div>
        <label className="text-xs text-[#aaa094]">Одна заметка — необязательно<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Например: поздно лёг, но утром спокойно" maxLength={240} className="mt-1.5 min-h-20 w-full resize-none rounded-lg border border-[#4b453c] bg-[#24211c] px-3 py-2 text-sm text-[#f6f1e7] placeholder:text-[#746c60] focus:outline-none focus:ring-1 focus:ring-[#e8dac0]" /></label>
        <DialogFooter className="mt-1"><Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#c7bfb2] hover:bg-[#24211c] hover:text-[#f6f1e7]">Отмена</Button><Button disabled={!canSave} onClick={() => onSave({ id: entry?.id ?? crypto.randomUUID(), date, bedtime, wakeTime, mood, note: note.trim() || undefined })} className="bg-[#e8dac0] text-[#201d18] hover:bg-[#f3e7d0]"><Check /> Сохранить ночь</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
