import * as React from "react";
import {
  BookOpen,
  Cake,
  ExternalLink,
  Film,
  Lightbulb,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  type MovieInput,
  type MovieStatus,
  type PlannerMovie,
  useKinopoiskMovieSearch,
  usePlannerMovies,
} from "@/hooks/use-planner-movies";
import "./planner-collections-screen.css";

const movieStatuses: Array<{ id: MovieStatus; label: string }> = [
  { id: "want_to_watch", label: "Хочу посмотреть" },
  { id: "watching", label: "Смотрю" },
  { id: "watched", label: "Просмотрено" },
  { id: "postponed", label: "Отложено" },
];

const collectionTypes = [
  { id: "movies", label: "Фильмы", icon: Film, active: true },
  { id: "purchases", label: "Покупки", icon: ShoppingBag, active: false },
  { id: "birthdays", label: "Дни рождения", icon: Cake, active: false },
  { id: "places", label: "Места", icon: MapPin, active: false },
  { id: "learning", label: "Изучить", icon: BookOpen, active: false },
  { id: "ideas", label: "Идеи", icon: Lightbulb, active: false },
] as const;

const statusLabel = (status: MovieStatus) =>
  movieStatuses.find((item) => item.id === status)?.label ?? status;

export function PlannerCollectionsScreen() {
  const movies = usePlannerMovies();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<MovieStatus | "all">("all");
  const [editing, setEditing] = React.useState<PlannerMovie | "new" | null>(
    null
  );
  const filtered = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    return (movies.data ?? []).filter((item) => {
      if (status !== "all" && item.movie.status !== status) return false;
      if (!needle) return true;
      return [
        item.title,
        item.movie.original_title,
        item.movie.director,
        item.movie.recommended_by,
        ...item.movie.genres,
      ].some((value) => value?.toLocaleLowerCase("ru-RU").includes(needle));
    });
  }, [movies.data, query, status]);

  return (
    <section className="collections-screen">
      <div className="collections-heading">
        <div>
          <span>ЛИЧНАЯ БИБЛИОТЕКА</span>
          <h1>Коллекции.</h1>
        </div>
        <button className="collections-add" onClick={() => setEditing("new")}>
          <Plus size={16} /> Добавить фильм
        </button>
      </div>

      <nav className="collection-type-nav" aria-label="Типы коллекций">
        {collectionTypes.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={item.active ? "active" : ""}
              disabled={!item.active}
              title={item.active ? item.label : `${item.label} — скоро`}
            >
              <Icon size={15} strokeWidth={1.7} />
              <span>{item.label}</span>
              {!item.active ? <small>СКОРО</small> : null}
            </button>
          );
        })}
      </nav>

      <div className="movie-toolbar">
        <label>
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название, жанр, режиссёр"
          />
        </label>
        <div className="movie-status-filter">
          <button
            className={status === "all" ? "active" : ""}
            onClick={() => setStatus("all")}
          >
            Все
          </button>
          {movieStatuses.map((item) => (
            <button
              key={item.id}
              className={status === item.id ? "active" : ""}
              onClick={() => setStatus(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {movies.isLoading ? (
        <div className="collection-empty">
          <Film size={20} />
          <h2>Собираю коллекцию…</h2>
        </div>
      ) : null}
      {movies.isError ? (
        <div className="collection-empty collection-error">
          <Film size={20} />
          <h2>Коллекция пока недоступна.</h2>
          <p>Обновите приложение после установки схемы данных.</p>
        </div>
      ) : null}
      {!movies.isLoading && !movies.isError && filtered.length ? (
        <div className="movie-grid">
          {filtered.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              onOpen={() => setEditing(movie)}
            />
          ))}
        </div>
      ) : null}
      {!movies.isLoading && !movies.isError && !filtered.length ? (
        <div className="collection-empty">
          <Film size={20} />
          <h2>{query || status !== "all" ? "Ничего не найдено." : "Первый фильм ждёт."}</h2>
          <p>
            {query || status !== "all"
              ? "Измените поиск или фильтр."
              : "Добавьте фильм, который не хочется потерять."}
          </p>
          {!query && status === "all" ? (
            <button onClick={() => setEditing("new")}>
              <Plus size={15} /> Добавить фильм
            </button>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <MovieEditor
          movie={editing === "new" ? null : editing}
          isSaving={movies.create.isPending || movies.update.isPending}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (editing === "new") await movies.create.mutateAsync(input);
            else await movies.update.mutateAsync({ id: editing.id, ...input });
            setEditing(null);
          }}
          onDelete={
            editing === "new"
              ? undefined
              : async () => {
                  if (!window.confirm(`Удалить «${editing.title}»?`)) return;
                  await movies.remove.mutateAsync(editing.id);
                  setEditing(null);
                }
          }
        />
      ) : null}
    </section>
  );
}

function MovieCard({ movie, onOpen }: { movie: PlannerMovie; onOpen: () => void }) {
  const details = [
    movie.movie.release_year,
    movie.movie.duration_minutes
      ? `${movie.movie.duration_minutes} мин`
      : null,
  ].filter(Boolean);
  return (
    <button className="movie-card" onClick={onOpen}>
      <div className="movie-poster">
        {movie.image_url ? (
          <img src={movie.image_url} alt="" loading="lazy" />
        ) : (
          <div className="movie-poster-placeholder">
            <Film size={22} />
            <span>{movie.title.slice(0, 1)}</span>
          </div>
        )}
        <span className={`movie-status ${movie.movie.status}`}>
          {statusLabel(movie.movie.status)}
        </span>
        {movie.movie.external_rating !== null ? (
          <b className="movie-rating">{movie.movie.external_rating}</b>
        ) : null}
      </div>
      <div className="movie-card-copy">
        <h2>{movie.title}</h2>
        {movie.movie.original_title ? <p>{movie.movie.original_title}</p> : null}
        <small>{details.join(" · ") || "Без деталей"}</small>
        {movie.movie.genres.length ? (
          <div className="movie-genres">
            {movie.movie.genres.slice(0, 3).map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function MovieEditor({
  movie,
  isSaving,
  onClose,
  onSave,
  onDelete,
}: {
  movie: PlannerMovie | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: MovieInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [title, setTitle] = React.useState(movie?.title ?? "");
  const [originalTitle, setOriginalTitle] = React.useState(
    movie?.movie.original_title ?? ""
  );
  const [releaseYear, setReleaseYear] = React.useState(
    movie?.movie.release_year?.toString() ?? ""
  );
  const [duration, setDuration] = React.useState(
    movie?.movie.duration_minutes?.toString() ?? ""
  );
  const [genres, setGenres] = React.useState(movie?.movie.genres.join(", ") ?? "");
  const [director, setDirector] = React.useState(movie?.movie.director ?? "");
  const [imageUrl, setImageUrl] = React.useState(movie?.image_url ?? "");
  const [sourceUrl, setSourceUrl] = React.useState(movie?.source_url ?? "");
  const [recommendedBy, setRecommendedBy] = React.useState(
    movie?.movie.recommended_by ?? ""
  );
  const [note, setNote] = React.useState(movie?.note ?? "");
  const [status, setStatus] = React.useState<MovieStatus>(
    movie?.movie.status ?? "want_to_watch"
  );
  const [externalRating, setExternalRating] = React.useState<number | null>(
    movie?.movie.external_rating ?? null
  );
  const [kinopoiskId, setKinopoiskId] = React.useState<number | null>(
    movie?.movie.kinopoisk_id ?? null
  );
  const [error, setError] = React.useState<string | null>(null);
  const deferredTitle = React.useDeferredValue(title);
  const kinopoisk = useKinopoiskMovieSearch(
    deferredTitle,
    !movie && kinopoiskId === null
  );

  const selectKinopoiskMovie = (
    result: NonNullable<typeof kinopoisk.data>[number]
  ) => {
    setTitle(result.title);
    setOriginalTitle(result.originalTitle ?? "");
    setReleaseYear(result.year?.toString() ?? "");
    setGenres(result.genres.join(", "));
    setImageUrl(result.posterUrl ?? "");
    setSourceUrl(result.sourceUrl);
    setExternalRating(result.ratingKinopoisk);
    setKinopoiskId(result.kinopoiskId);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError("Введите название фильма.");
    setError(null);
    try {
      await onSave({
        title,
        originalTitle,
        releaseYear: releaseYear ? Number(releaseYear) : null,
        durationMinutes: duration ? Number(duration) : null,
        genres: genres
          .split(",")
          .map((genre) => genre.trim())
          .filter(Boolean),
        director,
        imageUrl,
        sourceUrl,
        recommendedBy,
        note,
        status,
        externalRating,
        kinopoiskId,
      });
    } catch {
      setError("Не удалось сохранить фильм.");
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="planner-modal movie-editor"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-top">
          <span>{movie ? "КАРТОЧКА ФИЛЬМА" : "НОВЫЙ ФИЛЬМ"}</span>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="movie-editor-title">
          <div>
            <h2>{movie ? movie.title : "Добавить в коллекцию."}</h2>
            {movie?.source_url ? (
              <a href={movie.source_url} target="_blank" rel="noreferrer">
                Источник <ExternalLink size={12} />
              </a>
            ) : null}
          </div>
          <Film size={22} />
        </div>
        <div className="movie-form-grid">
          <label className="wide">
            {movie ? "Название" : "Название — найдём на Кинопоиске"}
            <div className="kinopoisk-title-input">
              <input
                value={title}
                autoComplete="off"
                placeholder={movie ? undefined : "Например, Идеальные дни"}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (!movie) {
                    setKinopoiskId(null);
                    setExternalRating(null);
                  }
                }}
              />
              {!movie && kinopoisk.isFetching ? (
                <LoaderCircle className="kinopoisk-spinner" size={15} />
              ) : null}
            </div>
            {!movie && kinopoiskId !== null ? (
              <div className="kinopoisk-selected">
                <span>Найдено на Кинопоиске</span>
                {externalRating !== null ? (
                  <b><Star size={11} fill="currentColor" /> {externalRating}</b>
                ) : null}
                <button type="button" onClick={() => setKinopoiskId(null)}>
                  Выбрать другой
                </button>
              </div>
            ) : null}
            {!movie && kinopoiskId === null && kinopoisk.data?.length ? (
              <div className="kinopoisk-results" aria-label="Результаты Кинопоиска">
                {kinopoisk.data.map((result) => (
                  <button
                    key={result.kinopoiskId}
                    type="button"
                    onClick={() => selectKinopoiskMovie(result)}
                  >
                    <span className="kinopoisk-result-poster">
                      {result.posterUrl ? <img src={result.posterUrl} alt="" /> : <Film size={15} />}
                    </span>
                    <span>
                      <strong>{result.title}</strong>
                      <small>{[result.originalTitle, result.year].filter(Boolean).join(" · ")}</small>
                    </span>
                    {result.ratingKinopoisk !== null ? (
                      <b><Star size={10} fill="currentColor" /> {result.ratingKinopoisk}</b>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            {!movie && kinopoiskId === null && kinopoisk.isError ? (
              <small className="kinopoisk-error">
                Поиск Кинопоиска пока недоступен. Фильм можно заполнить вручную.
              </small>
            ) : null}
          </label>
          <label className="wide">
            Оригинальное название
            <input
              value={originalTitle}
              onChange={(event) => setOriginalTitle(event.target.value)}
            />
          </label>
          <label>
            Год
            <input
              type="number"
              min="1888"
              max="2200"
              value={releaseYear}
              onChange={(event) => setReleaseYear(event.target.value)}
            />
          </label>
          <label>
            Длительность, мин
            <input
              type="number"
              min="1"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </label>
          <label className="wide">
            Жанры через запятую
            <input value={genres} onChange={(event) => setGenres(event.target.value)} />
          </label>
          <label>
            Режиссёр
            <input value={director} onChange={(event) => setDirector(event.target.value)} />
          </label>
          <label>
            Кто посоветовал
            <input
              value={recommendedBy}
              onChange={(event) => setRecommendedBy(event.target.value)}
            />
          </label>
          <label className="wide">
            Ссылка на постер
            <input
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
            />
          </label>
          <label className="wide">
            Ссылка на фильм
            <input
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
            />
          </label>
          <label className="wide">
            Статус
            <select value={status} onChange={(event) => setStatus(event.target.value as MovieStatus)}>
              {movieStatuses.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Заметка
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-footer">
          {onDelete ? (
            <button className="delete-button" type="button" onClick={() => void onDelete()}>
              <Trash2 size={15} /> Удалить
            </button>
          ) : null}
          <button className="complete-modal" disabled={isSaving} type="submit">
            {isSaving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </form>
    </div>
  );
}
