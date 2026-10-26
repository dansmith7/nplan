import {
  CalendarDays,
  Clock3,
  Dumbbell,
  MoonStar,
  TrendingUp,
  Wine,
} from "lucide-react";
import type { Observation, ObservationGroup } from "./planner-observations";

const icons = {
  duration: MoonStar,
  schedule: Clock3,
  training: Dumbbell,
  habits: Wine,
  weekday: CalendarDays,
  trends: TrendingUp,
};
const states = {
  signal: "Есть различие",
  neutral: "Близкие значения",
  insufficient: "Нужны записи",
};

function ObservationContent({ item }: { item: Observation }) {
  return (
    <>
      <p className="observation-finding">{item.finding}</p>
      <p className="observation-evidence">{item.evidence}</p>
      <p className="observation-suggestion">
        <span>
          {item.status === "signal" ? "Что попробовать" : "Следующий шаг"}
        </span>
        {item.suggestion}
      </p>
    </>
  );
}

export function PlannerObservationsPanel({
  groups,
  isLoading,
  isError,
  onRetry,
}: {
  groups: ObservationGroup[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      className="analytics-relations personal-observations"
      aria-label="Наблюдения о дне и сне"
    >
      <header>
        <div>
          <h2>Наблюдения о дне и сне</h2>
          <p>
            Последние 90 дней. Совпадения в твоих записях помогают выбрать, что
            проверить дальше.
          </p>
        </div>
      </header>
      {isError ? (
        <div className="observation-query-state" role="alert">
          <p>Не удалось загрузить записи. Проверь подключение и повтори.</p>
          <button type="button" onClick={onRetry}>
            Повторить загрузку
          </button>
        </div>
      ) : isLoading ? (
        <div className="observation-query-state" role="status">
          Загружаю наблюдения…
        </div>
      ) : (
        <div className="observations-grid">
          {groups.map((group) => {
            const Icon = icons[group.id as keyof typeof icons];
            const first = group.items[0];
            if (!first) return null;
            return (
              <article className="observation-card" key={group.id}>
                <div className="observation-heading">
                  <Icon size={18} aria-hidden="true" />
                  <h3>{group.title}</h3>
                </div>
                <span className="observation-status" data-status={first.status}>
                  {states[first.status]}
                </span>
                <ObservationContent item={first} />
                {group.items.length > 1 ? (
                  <details className="observation-details">
                    <summary>
                      Остальные сравнения · {group.items.length - 1}
                    </summary>
                    {group.items.slice(1).map((item) => (
                      <div className="observation-detail" key={item.id}>
                        <ObservationContent item={item} />
                      </div>
                    ))}
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      <p className="observation-method">
        Сравнения описывают связь, а не причину. День без отметки тренировки
        считается днём отдыха. Остальные пустые отметки и оценки исключены. Сон
        сопоставляется с последующим днём, привычки с ночью после них. Небольшие
        различия не превращаются в рекомендации. Общий индекс сна в расчёте
        связей не используется.
      </p>
    </section>
  );
}
