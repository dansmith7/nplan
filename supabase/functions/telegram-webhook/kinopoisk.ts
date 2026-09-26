type KinopoiskSearchFilm = {
  filmId?: number;
  kinopoiskId?: number;
  nameRu?: string;
  nameEn?: string;
  nameOriginal?: string;
  year?: string;
  type?: string;
};

type KinopoiskFilm = {
  kinopoiskId?: number;
  nameRu?: string;
  nameEn?: string;
  nameOriginal?: string;
  year?: number;
  posterUrl?: string;
  posterUrlPreview?: string;
  coverUrl?: string;
  shortDescription?: string;
  description?: string;
  ratingKinopoisk?: number;
  ratingImdb?: number;
  imdbId?: string;
  webUrl?: string;
  genres?: Array<{ genre?: string }>;
  countries?: Array<{ country?: string }>;
};

type KinopoiskStaffMember = {
  nameRu?: string;
  nameEn?: string;
  professionKey?: string;
};

export type EnrichedMovie = {
  source: "kinopoisk";
  kinopoiskId: number;
  title: string;
  originalTitle: string | null;
  year: number | null;
  description: string | null;
  posterUrl: string | null;
  ratingKinopoisk: number | null;
  ratingImdb: number | null;
  imdbId: string | null;
  sourceUrl: string;
  genres: string[];
  countries: string[];
  directors: string[];
};

const KINOPOISK_API_BASE = "https://kinopoiskapiunofficial.tech/api";
const KINOPOISK_ID_RE = /kinopoisk\.ru\/film\/(\d+)/i;
const MOVIE_HINT_RE =
  /(kinopoisk|кинопоиск|imdb|фильм|кино|сериал|посмотреть|смотреть|watch)/i;

export async function enrichMovieFromText(
  text: string
): Promise<EnrichedMovie | null> {
  const apiKey = Deno.env.get("KINOPOISK_API_KEY");
  if (!apiKey) return null;

  const kinopoiskId = extractKinopoiskId(text);
  const query = normalizeMovieQuery(text);
  const shouldSearchEveryText =
    Deno.env.get("KINOPOISK_ENRICH_ALL_TEXT") === "true";

  if (
    !kinopoiskId &&
    (!query || (!shouldSearchEveryText && !MOVIE_HINT_RE.test(text)))
  ) {
    return null;
  }

  const filmId = kinopoiskId ?? (await findBestFilmId(apiKey, query));
  if (!filmId) return null;

  return fetchFilm(apiKey, filmId);
}

function extractKinopoiskId(text: string): number | null {
  const match = text.match(KINOPOISK_ID_RE);
  return match?.[1] ? Number(match[1]) : null;
}

function normalizeMovieQuery(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[«»"'“”]/g, " ")
    .replace(
      /(хочу|надо|нужно|добавь|добавить|посмотреть|смотреть|фильм|кино|сериал|watch|movie|series)/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function findBestFilmId(
  apiKey: string,
  query: string
): Promise<number | null> {
  if (!query) return null;

  const searchUrl = new URL(`${KINOPOISK_API_BASE}/v2.1/films/search-by-keyword`);
  searchUrl.searchParams.set("keyword", query);
  searchUrl.searchParams.set("page", "1");

  const result = await fetchKinopoisk<{ films?: KinopoiskSearchFilm[] }>(
    apiKey,
    searchUrl
  );
  const films = result?.films ?? [];
  if (!films.length) return null;

  const scored = films
    .map((film) => ({ film, score: scoreFilmCandidate(query, film) }))
    .filter(({ score }) => score >= 30)
    .sort((a, b) => b.score - a.score);

  const bestFilm = scored[0]?.film ?? films[0];
  return bestFilm.filmId ?? bestFilm.kinopoiskId ?? null;
}

function scoreFilmCandidate(query: string, film: KinopoiskSearchFilm): number {
  const normalizedQuery = normalizeComparable(query);
  const titles = [film.nameRu, film.nameOriginal, film.nameEn]
    .filter(Boolean)
    .map((title) => normalizeComparable(title ?? ""));

  let score = 0;
  for (const title of titles) {
    if (title === normalizedQuery) score = Math.max(score, 100);
    else if (title.startsWith(normalizedQuery)) score = Math.max(score, 75);
    else if (title.includes(normalizedQuery)) score = Math.max(score, 55);
    else if (normalizedQuery.includes(title)) score = Math.max(score, 45);
  }

  const year = film.year?.match(/\d{4}/)?.[0];
  if (year && normalizedQuery.includes(year)) score += 15;
  if (film.type === "FILM" || film.type === "TV_SERIES") score += 5;

  return score;
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchFilm(
  apiKey: string,
  kinopoiskId: number
): Promise<EnrichedMovie | null> {
  const [film, staff] = await Promise.all([
    fetchKinopoisk<KinopoiskFilm>(
      apiKey,
      `${KINOPOISK_API_BASE}/v2.2/films/${kinopoiskId}`
    ),
    fetchKinopoisk<KinopoiskStaffMember[]>(
      apiKey,
      `${KINOPOISK_API_BASE}/v1/staff?filmId=${kinopoiskId}`
    ),
  ]);

  if (!film) return null;

  const title = film.nameRu || film.nameOriginal || film.nameEn;
  if (!title) return null;

  return {
    source: "kinopoisk",
    kinopoiskId: film.kinopoiskId ?? kinopoiskId,
    title,
    originalTitle: film.nameOriginal || film.nameEn || null,
    year: film.year ?? null,
    description: film.shortDescription || film.description || null,
    posterUrl: film.posterUrl || film.posterUrlPreview || film.coverUrl || null,
    ratingKinopoisk: film.ratingKinopoisk ?? null,
    ratingImdb: film.ratingImdb ?? null,
    imdbId: film.imdbId || null,
    sourceUrl: film.webUrl || `https://www.kinopoisk.ru/film/${kinopoiskId}/`,
    genres: (film.genres ?? [])
      .map((item) => item.genre)
      .filter(Boolean) as string[],
    countries: (film.countries ?? [])
      .map((item) => item.country)
      .filter(Boolean) as string[],
    directors: (staff ?? [])
      .filter((person) => person.professionKey === "DIRECTOR")
      .map((person) => person.nameRu || person.nameEn)
      .filter(Boolean) as string[],
  };
}

async function fetchKinopoisk<T>(
  apiKey: string,
  url: string | URL
): Promise<T | null> {
  const response = await fetch(url, {
    headers: {
      "X-API-KEY": apiKey,
      accept: "application/json",
    },
  });

  if (!response.ok) return null;
  return (await response.json()) as T;
}
