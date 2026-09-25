import * as React from "react";
import { Check, ChevronLeft, ChevronRight, CircleCheck, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  type PlannerStudentRow,
  usePlannerStudents,
} from "@/hooks/use-planner-students";
import {
  type PlannerLessonRow,
  usePlannerLessons,
} from "@/hooks/use-planner-lessons";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const weekdayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function getLessonRange() {
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  const to = new Date();
  to.setFullYear(to.getFullYear() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function PlannerStudentsScreen() {
  const students = usePlannerStudents();
  const range = React.useMemo(getLessonRange, []);
  const lessons = usePlannerLessons(range);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [editingStudent, setEditingStudent] = React.useState<PlannerStudentRow | "new" | null>(null);
  const [editingLesson, setEditingLesson] = React.useState<PlannerLessonRow | null>(null);

  const selected = students.data?.find((student) => student.id === selectedId) ?? null;
  const allLessons = lessons.data ?? [];

  if (selected) {
    return (
      <StudentProfile
        student={selected}
        lessons={allLessons.filter((lesson) => lesson.student.id === selected.id)}
        onBack={() => setSelectedId(null)}
        onEdit={() => setEditingStudent(selected)}
        onLesson={setEditingLesson}
      >
        {editingStudent ? (
          <StudentEditor
            student={editingStudent}
            busy={students.rename.isPending || students.remove.isPending}
            onClose={() => setEditingStudent(null)}
            onSave={async (name) => {
              if (editingStudent === "new") await students.create.mutateAsync(name);
              else await students.rename.mutateAsync({ id: editingStudent.id, name });
              setEditingStudent(null);
            }}
            onDelete={editingStudent === "new" ? undefined : async () => {
              await students.remove.mutateAsync(editingStudent.id);
              setEditingStudent(null);
              setSelectedId(null);
            }}
          />
        ) : null}
        {editingLesson ? (
          <LessonNotesEditor
            lesson={editingLesson}
            busy={lessons.saveNotes.isPending}
            onClose={() => setEditingLesson(null)}
            onSave={async (topic, homework) => {
              await lessons.saveNotes.mutateAsync({ eventId: editingLesson.id, topic, homework });
              setEditingLesson(null);
            }}
          />
        ) : null}
      </StudentProfile>
    );
  }

  return (
    <section className="students-screen">
      <div className="screen-heading">
        <div>
          <span>РАБОТА С УЧЕНИКАМИ</span>
          <h1>Ученики</h1>
        </div>
        <button className="new-task-button" onClick={() => setEditingStudent("new")}>
          <Plus size={16} /> Добавить ученика
        </button>
      </div>

      {students.isLoading ? <div className="students-loading">Загружаю учеников…</div> : null}
      {!students.isLoading && students.data?.length ? (
        <div className="students-grid">
          {students.data.map((student) => {
            const studentLessons = allLessons.filter((lesson) => lesson.student.id === student.id);
            const next = studentLessons.find(
              (lesson) => lesson.notes?.status === "scheduled" && new Date(lesson.starts_at) > new Date()
            );
            const heldCount = studentLessons.filter((lesson) => lesson.notes?.status === "held").length;
            return (
              <article className="student-card" key={student.id}>
                <div className="student-initial">{student.name[0]}</div>
                <span>БЛИЖАЙШЕЕ ЗАНЯТИЕ</span>
                <h2>{student.name}</h2>
                <p>{next ? dateFormatter.format(new Date(next.starts_at)) : "Пока не назначено"}</p>
                <div>
                  <small>{heldCount} занятий</small>
                  <button onClick={() => setSelectedId(student.id)}>
                    Профиль <ChevronRight size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {!students.isLoading && !students.data?.length ? (
        <section className="empty-state students-empty-state">
          <CircleCheck size={22} />
          <div>
            <h3>Учеников пока нет.</h3>
            <p>Добавьте ученика, затем задайте расписание и создайте первый урок.</p>
          </div>
          <button onClick={() => setEditingStudent("new")}>
            <Plus size={15} /> Добавить ученика
          </button>
        </section>
      ) : null}

      {editingStudent ? (
        <StudentEditor
          student={editingStudent}
          busy={students.create.isPending}
          onClose={() => setEditingStudent(null)}
          onSave={async (name) => {
            await students.create.mutateAsync(name);
            setEditingStudent(null);
          }}
        />
      ) : null}
    </section>
  );
}

function StudentProfile({
  student,
  lessons,
  onBack,
  onEdit,
  onLesson,
  children,
}: {
  student: PlannerStudentRow;
  lessons: PlannerLessonRow[];
  onBack: () => void;
  onEdit: () => void;
  onLesson: (lesson: PlannerLessonRow) => void;
  children: React.ReactNode;
}) {
  const held = lessons.filter((lesson) => lesson.notes?.status === "held").reverse();
  const next = lessons.find(
    (lesson) => lesson.notes?.status === "scheduled" && new Date(lesson.starts_at) > new Date()
  );
  const schedule = student.schedules.filter((item) => item.active);
  return (
    <section className="student-profile">
      <button className="back-link" onClick={onBack}>
        <ChevronLeft size={16} /> Все ученики
      </button>
      <div className="profile-hero">
        <div className="student-initial">{student.name[0]}</div>
        <div>
          <span>КАРТОЧКА УЧЕНИКА</span>
          <h1>{student.name}</h1>
          <p>{schedule.length ? schedule.map(formatSchedule).join(" · ") : "Расписание не задано"}</p>
        </div>
        <button className="new-task-button" onClick={onEdit}>
          <Pencil size={15} /> Редактировать
        </button>
      </div>
      <div className="profile-grid">
        <section>
          <span>БЛИЖАЙШИЙ УРОК</span>
          <h2>{next ? dateFormatter.format(new Date(next.starts_at)) : "Не назначен"}</h2>
          <p>Напоминание за час до занятия</p>
        </section>
        <section>
          <span>ПОСЛЕДНЕЕ ДЗ</span>
          <h2>{held[0]?.notes?.homework || "Пока не заполнено"}</h2>
          <p>Хранится у конкретного урока</p>
        </section>
      </div>
      <section className="profile-history">
        <header><span>ИСТОРИЯ</span><h2>Занятия</h2></header>
        {held.length ? held.map((lesson) => (
          <button key={lesson.id} onClick={() => onLesson(lesson)}>
            <CircleCheck size={16} />
            <span>{dateFormatter.format(new Date(lesson.starts_at))} · {lesson.notes?.topic || "Тема не заполнена"}</span>
            <ChevronRight size={15} />
          </button>
        )) : <p className="student-history-empty">Проведённые уроки появятся здесь.</p>}
      </section>
      {children}
    </section>
  );
}

function formatSchedule(schedule: PlannerStudentRow["schedules"][number]) {
  return `${weekdayNames[schedule.weekday]} · ${schedule.starts_at.slice(0, 5)}`;
}

function StudentEditor({ student, busy, onClose, onSave, onDelete }: {
  student: PlannerStudentRow | "new";
  busy: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = React.useState(student === "new" ? "" : student.name);
  return <Dialog onClose={onClose}>
    <div className="modal-top"><span>{student === "new" ? "НОВЫЙ УЧЕНИК" : "КАРТОЧКА УЧЕНИКА"}</span><button onClick={onClose}><X size={18} /></button></div>
    <h2>{student === "new" ? "Добавить ученика" : "Изменить имя"}</h2>
    <label>Имя<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
    <div className="modal-footer">
      {onDelete ? <button className="delete-button" disabled={busy} onClick={() => void onDelete()}><Trash2 size={15} /> Удалить</button> : null}
      <button className="complete-modal" disabled={busy || !name.trim()} onClick={() => void onSave(name.trim())}><Check size={16} /> Сохранить</button>
    </div>
  </Dialog>;
}

function LessonNotesEditor({ lesson, busy, onClose, onSave }: {
  lesson: PlannerLessonRow;
  busy: boolean;
  onClose: () => void;
  onSave: (topic: string, homework: string) => Promise<void>;
}) {
  const [topic, setTopic] = React.useState(lesson.notes?.topic ?? "");
  const [homework, setHomework] = React.useState(lesson.notes?.homework ?? "");
  return <Dialog onClose={onClose}>
    <div className="modal-top"><span>УРОК · {dateFormatter.format(new Date(lesson.starts_at))}</span><button onClick={onClose}><X size={18} /></button></div>
    <h2>{lesson.student.name}</h2>
    <label>Тема урока<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Что проходили?" /></label>
    <label>Домашнее задание<textarea value={homework} onChange={(event) => setHomework(event.target.value)} placeholder="Свободный текст" /></label>
    <div className="modal-footer"><button className="complete-modal" disabled={busy} onClick={() => void onSave(topic, homework)}><Check size={16} /> Сохранить</button></div>
  </Dialog>;
}

function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="planner-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>{children}</section></div>;
}

