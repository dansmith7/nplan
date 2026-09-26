import { searchKinopoiskMovies } from "../telegram-webhook/kinopoisk.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = (await request.json()) as { query?: string };
    const query = body.query?.trim() ?? "";
    if (query.length < 2) return json({ results: [] });
    return json({ results: await searchKinopoiskMovies(query) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kinopoisk search failed";
    return json({ error: message }, message.includes("not configured") ? 503 : 502);
  }
});
