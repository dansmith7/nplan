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
  type CollectionItemInput,
  type CollectionItemType,
  type MovieInput,
  type MovieStatus,
  type PlannerMovie,
  type PlannerCollectionItem,
  useKinopoiskMovieSearch,
  usePlannerCollectionItems,
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
  { id: "movie", label: "Фильмы", icon: Film },
  { id: "purchase", label: "Покупки", icon: ShoppingBag },
  { id: "birthday", label: "Дни рождения", icon: Cake },
  { id: "place", label: "Места", icon: MapPin },
  { id: "learning", label: "Изучить", icon: BookOpen },
  { id: "idea", label: "Идеи", icon: Lightbulb },
] as const;

const collectionEmptyCopy: Record<Exclude<CollectionItemType, "movie">, string> = {
  purchase: "Здесь появятся покупки, которые хочется обдумать.",
  birthday: "Сохраняйте дни рождения, чтобы позже поставить напоминание.",
  place: "Места, в которые хочется однажды попасть.",
  learning: "Книги, статьи, видео и курсы — без превращения в задачу.",
  idea: "Мысли, которые пока не требуют действия.",
};

const statusLabel = (status: MovieStatus) =>
  movieStatuses.find((item) => item.id === status)?.label ?? status;

export function PlannerCollectionsScreen({
  initialType = "movie",
}: {
  initialType?: CollectionItemType;
}) {
  const [activeType, setActiveType] =
    React.useState<CollectionItemType>(initialType);
  const movies = usePlannerMovies();
  const genericType = activeType === "movie" ? "idea" : activeType;
  const genericItems = usePlannerCollectionItems(
    genericType,
    activeType !== "movie"
  );
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<MovieStatus | "all">("all");
  const [editing, setEditing] = React.useState<PlannerMovie | "new" | null>(
    null
  );
  const [genericEditing, setGenericEditing] = React.useState<
    PlannerCollectionItem | "new" | null
  >(null);
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
        {activeType === "movie" ? (
          <button className="collections-add" onClick={() => setEditing("new")}>
            <Plus size={16} /> Добавить фильм
          </button>
        ) : (
          <button className="collections-add" onClick={() => setGenericEditing("new")}>
            <Plus size={16} /> Добавить запись
          </button>
        )}
      </div>

      <nav className="collection-type-nav" aria-label="Типы коллекций">
        {collectionTypes.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={activeType === item.id ? "active" : ""}
              onClick={() => setActiveType(item.id)}
              title={item.label}
            >
              <Icon size={15} strokeWidth={1.7} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {activeType === "movie" ? <><div className="movie-toolbar">
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
      </> : (
        <GenericCollection
          type={genericType}
          items={genericItems.data ?? []}
          isLoading={genericItems.isLoading}
          isError={genericItems.isError}
          onOpen={setGenericEditing}
        />
      )}

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
      {genericEditing ? (
        <CollectionItemEditor
          type={genericType}
          item={genericEditing === "new" ? null : genericEditing}
          isSaving={genericItems.save.isPending}
          onClose={() => setGenericEditing(null)}
          onSave={async (input) => {
            await genericItems.save.mutateAsync({
              id: genericEditing === "new" ? undefined : genericEditing.id,
              input,
            });
            setGenericEditing(null);
          }}
          onDelete={genericEditing === "new" ? undefined : async () => {
            if (!window.confirm(`Удалить «${genericEditing.title}»?`)) return;
            await genericItems.remove.mutateAsync(genericEditing.id);
            setGenericEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function GenericCollection({
  type,
  items,
  isLoading,
  isError,
  onOpen,
}: {
  type: Exclude<CollectionItemType, "movie">;
  items: PlannerCollectionItem[];
  isLoading: boolean;
  isError: boolean;
  onOpen: (item: PlannerCollectionItem) => void;
}) {
  if (isLoading) return <div className="collection-empty"><LoaderCircle className="generic-loader" size={20} /><h2>Собираю коллекцию…</h2></div>;
  if (isError) return <div className="collection-empty collection-error"><h2>Коллекция пока недоступна.</h2></div>;
  if (!items.length) return <div className="collection-empty"><LibraryIcon type={type} /><h2>Пока пусто.</h2><p>{collectionEmptyCopy[type]}</p></div>;
  return (
    <div className="generic-collection-list">
      {items.map((item) => (
        <button className="generic-collection-card" key={item.id} onClick={() => onOpen(item)}>
          <div className="generic-collection-icon"><LibraryIcon type={type} /></div>
          <div>
            <span>{collectionMeta(item)}</span>
            <h2>{item.title}</h2>
            {item.note ? <p>{item.note}</p> : null}
          </div>
          <ExternalLink size={14} />
        </button>
      ))}
    </div>
  );
}

function collectionMeta(item: PlannerCollectionItem) {
  if (item.type === "purchase" && item.purchase?.price_amount !== null) {
    return `${item.purchase?.price_amount ?? ""} ${item.purchase?.currency ?? "RUB"}`;
  }
  if (item.type === "birthday" && item.birthday?.birth_date) {
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${item.birthday.birth_date}T12:00:00`));
  }
  if (item.type === "place" && item.place?.location) return item.place.location;
  if (item.type === "learning") {
    const labels: Record<string, string> = { saved: "Сохранено", in_progress: "Изучаю", completed: "Завершено" };
    return labels[item.learning?.status ?? "saved"] ?? "Сохранено";
  }
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(item.created_at));
}

function CollectionItemEditor({
  type,
  item,
  isSaving,
  onClose,
  onSave,
  onDelete,
}: {
  type: Exclude<CollectionItemType, "movie">;
  item: PlannerCollectionItem | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: CollectionItemInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [title, setTitle] = React.useState(item?.title ?? "");
  const [note, setNote] = React.useState(item?.note ?? "");
  const [sourceUrl, setSourceUrl] = React.useState(item?.source_url ?? "");
  const [imageUrl, setImageUrl] = React.useState(item?.image_url ?? "");
  const [price, setPrice] = React.useState(item?.purchase?.price_amount?.toString() ?? "");
  const [currency, setCurrency] = React.useState(item?.purchase?.currency ?? "RUB");
  const [birthDate, setBirthDate] = React.useState(item?.birthday?.birth_date ?? "");
  const [location, setLocation] = React.useState(item?.place?.location ?? "");
  const [mapUrl, setMapUrl] = React.useState(item?.place?.map_url ?? "");
  const [visited, setVisited] = React.useState(item?.place?.visited ?? false);
  const [contentKind, setContentKind] = React.useState(item?.learning?.content_kind ?? "other");
  const [contentStatus, setContentStatus] = React.useState(item?.learning?.status ?? "saved");
  const [error, setError] = React.useState<string | null>(null);
  const label = collectionTypes.find((entry) => entry.id === type)?.label ?? "Коллекция";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError(type === "birthday" ? "Введите имя." : "Введите название.");
    if (type === "birthday" && !birthDate) return setError("Укажите дату рождения.");
    setError(null);
    try {
      await onSave({
        type, title, note, sourceUrl, imageUrl,
        priceAmount: price ? Number(price) : null,
        currency, birthDate: birthDate || null, location, mapUrl, visited,
        contentKind, contentStatus,
      });
    } catch {
      setError("Не удалось сохранить запись.");
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="planner-modal movie-editor collection-item-editor" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-top"><span>{item ? label.toUpperCase() : `НОВАЯ ЗАПИСЬ · ${label.toUpperCase()}`}</span><button type="button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button></div>
        <div className="movie-editor-title"><h2>{item ? item.title : "Сохранить на потом."}</h2><LibraryIcon type={type} /></div>
        <div className="movie-form-grid">
          <label className="wide">{type === "birthday" ? "Имя" : "Название"}<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          {type === "purchase" ? <><label>Цена<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label>Валюта<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option>RUB</option><option>CNY</option><option>USD</option><option>EUR</option></select></label><label className="wide">Изображение<input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /></label></> : null}
          {type === "birthday" ? <label className="wide">Дата рождения<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /><small className="field-hint">Событие повторяется ежегодно, напоминание — в этот же день.</small></label> : null}
          {type === "place" ? <><label className="wide">Город или адрес<input value={location} onChange={(event) => setLocation(event.target.value)} /></label><label className="wide">Ссылка на карту<input type="url" value={mapUrl} onChange={(event) => setMapUrl(event.target.value)} /></label><label className="collection-checkbox"><input type="checkbox" checked={visited} onChange={(event) => setVisited(event.target.checked)} /> Уже посетил</label></> : null}
          {type === "learning" ? <><label>Формат<select value={contentKind} onChange={(event) => setContentKind(event.target.value)}><option value="book">Книга</option><option value="article">Статья</option><option value="video">Видео</option><option value="course">Курс</option><option value="podcast">Подкаст</option><option value="other">Другое</option></select></label><label>Статус<select value={contentStatus} onChange={(event) => setContentStatus(event.target.value)}><option value="saved">Сохранено</option><option value="in_progress">Изучаю</option><option value="completed">Завершено</option></select></label></> : null}
          {type !== "birthday" ? <label className="wide">Ссылка<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label> : null}
          <label className="wide">Заметка<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
        </div>
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-footer">{onDelete ? <button className="delete-button" type="button" onClick={() => void onDelete()}><Trash2 size={15} /> Удалить</button> : null}<button className="complete-modal" disabled={isSaving} type="submit">{isSaving ? "Сохраняю…" : "Сохранить"}</button></div>
      </form>
    </div>
  );
}

function LibraryIcon({ type }: { type: Exclude<CollectionItemType, "movie"> }) {
  const Icon = collectionTypes.find((item) => item.id === type)?.icon ?? Lightbulb;
  return <Icon size={19} strokeWidth={1.6} />;
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
    kinopoiskId === null
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
            {kinopoiskId !== null ? "Название" : "Название — найдём на Кинопоиске"}
            <div className="kinopoisk-title-input">
              <input
                value={title}
                autoComplete="off"
                placeholder="Например, Идеальные дни"
                onChange={(event) => {
                  setTitle(event.target.value);
                  setKinopoiskId(null);
                  setExternalRating(null);
                }}
              />
              {kinopoiskId === null && kinopoisk.isFetching ? (
                <LoaderCircle className="kinopoisk-spinner" size={15} />
              ) : null}
            </div>
            {kinopoiskId !== null ? (
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
            {kinopoiskId === null && kinopoisk.data?.length ? (
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
            {kinopoiskId === null && kinopoisk.isError ? (
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
