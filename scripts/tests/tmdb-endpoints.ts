const BASE = process.env.API_BASE_URL || "http://localhost:3000";

const TITLES = {
  onePiece: { tmdb: 37854, label: "One Piece (anime TV)", type: "tv" as const, s: 1, e: 1 },
  familyGuy: { tmdb: 1434, label: "Family Guy (TV)", type: "tv" as const, s: 1, e: 1 },
  marioGalaxy: { tmdb: 1226863, label: "Super Mario Galaxy (movie)", type: "movie" as const },
};

type Result = {
  endpoint: string;
  status: number;
  ok: boolean;
  ms: number;
  summary: string;
  error?: string;
};

async function hit(path: string, timeoutMs = 120_000): Promise<Result> {
  const url = `${BASE}${path}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const ms = Date.now() - start;
    const text = await res.text();
    let summary = text.slice(0, 180).replace(/\s+/g, " ");
    try {
      const json = JSON.parse(text);
      if (json.error) summary = `error: ${json.error}`;
      else if (json.message) summary = `message: ${json.message}`;
      else if (json.success === false) summary = `fail: ${json.message ?? "unknown"}`;
      else if (Array.isArray(json.data)) summary = `data[${json.data.length}]`;
      else if (json.data?.sources) summary = `sources: ${json.data.sources.length}`;
      else if (json.data?.streams) summary = `streams: ${json.data.streams.length}`;
      else if (json.sources) summary = `sources: ${json.sources.length}`;
      else if (json.results) summary = `results: ${Array.isArray(json.results) ? json.results.length : "object"}`;
      else if (json.mappings) summary = `mappings: ${Object.keys(json.mappings).filter((k) => json.mappings[k]).length} ids`;
      else if (json.title || json.name) summary = `title: ${json.title ?? json.name}`;
      else if (json.status) summary = `status: ${json.status}`;
    } catch {
      /* keep raw summary */
    }
    return { endpoint: path, status: res.status, ok: res.ok, ms, summary };
  } catch (err) {
    return {
      endpoint: path,
      status: 0,
      ok: false,
      ms: Date.now() - start,
      summary: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function printSection(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

function printResults(results: Result[]) {
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    const status = r.status || "ERR";
    const detail = r.error ?? r.summary;
    console.log(`${icon} [${status}] ${r.ms}ms  ${r.endpoint}`);
    if (detail) console.log(`   → ${detail}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
}

async function testMappings() {
  printSection("MAPPINGS (AniZip cross-platform IDs)");
  const results: Result[] = [];
  for (const item of Object.values(TITLES)) {
    results.push(await hit(`/mappings?themoviedb_id=${item.tmdb}`));
  }
  printResults(results);
  return results;
}

async function testStreamProvider(prefix: string) {
  printSection(`STREAM /${prefix}`);
  const results: Result[] = [];

  results.push(await hit(`/stream/${prefix}`));

  // Super Mario Galaxy movie
  results.push(await hit(`/stream/${prefix}/movie/${TITLES.marioGalaxy.tmdb}`));
  results.push(
    await hit(`/stream/${prefix}/watch?type=movie&id=${TITLES.marioGalaxy.tmdb}`),
  );

  // One Piece TV
  const op = TITLES.onePiece;
  results.push(
    await hit(`/stream/${prefix}/tv/${op.tmdb}/${op.s}/${op.e}`),
  );
  results.push(
    await hit(`/stream/${prefix}/watch?type=tv&id=${op.tmdb}&s=${op.s}&e=${op.e}`),
  );

  // Family Guy TV
  const fg = TITLES.familyGuy;
  results.push(
    await hit(`/stream/${prefix}/tv/${fg.tmdb}/${fg.s}/${fg.e}`),
  );
  results.push(
    await hit(`/stream/${prefix}/watch?type=tv&id=${fg.tmdb}&s=${fg.s}&e=${fg.e}`),
  );

  printResults(results);
  return results;
}

async function testPrimesrc() {
  printSection("MOVIE-TV /primesrc (TMDB)");
  const results: Result[] = [];

  results.push(await hit("/movie-tv/primesrc"));
  results.push(await hit(`/movie-tv/primesrc/movie/${TITLES.marioGalaxy.tmdb}`));
  results.push(
    await hit(
      `/movie-tv/primesrc/tv/${TITLES.onePiece.tmdb}/${TITLES.onePiece.s}/${TITLES.onePiece.e}`,
    ),
  );
  results.push(
    await hit(
      `/movie-tv/primesrc/tv/${TITLES.familyGuy.tmdb}/${TITLES.familyGuy.s}/${TITLES.familyGuy.e}`,
    ),
  );

  printResults(results);
  return results;
}

async function searchProviderMedia(
  provider: string,
  query: string,
): Promise<{ mediaId?: string; episodeId?: string }> {
  const res = await hit(`/movie-tv/${provider}/media/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return {};

  try {
    const full = await fetch(`${BASE}/movie-tv/${provider}/media/search?q=${encodeURIComponent(query)}`);
    const json = await full.json();
    const first = json?.data?.[0] ?? json?.results?.[0] ?? json?.[0];
    if (!first) return {};
    const mediaId = first.id ?? first.slug ?? first.url?.split("/").pop();
    return { mediaId: mediaId ? String(mediaId) : undefined };
  } catch {
    return {};
  }
}

async function testHiMoviesFlixHQ() {
  printSection("MOVIE-TV /himovies & /flixhq (search → media → sources)");
  const results: Result[] = [];

  for (const provider of ["himovies", "flixhq"] as const) {
    results.push(await hit(`/movie-tv/${provider}`));
    results.push(await hit(`/movie-tv/${provider}/home`));

    // Movie: Super Mario Galaxy
    const movieSearch = await hit(
      `/movie-tv/${provider}/media/search?q=${encodeURIComponent("Super Mario Galaxy")}`,
    );
    results.push(movieSearch);

    let movieId: string | undefined;
    if (movieSearch.ok) {
      const r = await fetch(
        `${BASE}/movie-tv/${provider}/media/search?q=${encodeURIComponent("Super Mario Galaxy")}`,
      );
      const j = await r.json();
      const item = j?.data?.[0] ?? j?.results?.[0];
      movieId = item?.id ?? item?.slug;
      if (movieId) {
        results.push(await hit(`/movie-tv/${provider}/media/${movieId}`));
      }
    }

    // TV: Family Guy
    const fgSearch = await hit(
      `/movie-tv/${provider}/media/search?q=${encodeURIComponent("Family Guy")}`,
    );
    results.push(fgSearch);

    if (fgSearch.ok) {
      const r = await fetch(
        `${BASE}/movie-tv/${provider}/media/search?q=${encodeURIComponent("Family Guy")}`,
      );
      const j = await r.json();
      const item = j?.data?.[0] ?? j?.results?.[0];
      const tvId = item?.id ?? item?.slug;
      if (tvId) {
        results.push(await hit(`/movie-tv/${provider}/media/${tvId}`));
        results.push(
          await hit(`/movie-tv/${provider}/media/${tvId}/servers?s=1&e=1`),
        );
        // Try to get episode id from media info for sources
        const infoRes = await fetch(`${BASE}/movie-tv/${provider}/media/${tvId}`);
        const info = await infoRes.json();
        const epId =
          info?.data?.episodes?.[0]?.id ??
          info?.episodes?.[0]?.id ??
          info?.data?.seasons?.[0]?.episodes?.[0]?.id;
        if (epId) {
          results.push(await hit(`/movie-tv/${provider}/sources/${epId}`));
        }
      }
    }

    // TV/Anime: One Piece
    const opSearch = await hit(
      `/movie-tv/${provider}/media/search?q=${encodeURIComponent("One Piece")}`,
    );
    results.push(opSearch);

    if (opSearch.ok) {
      const r = await fetch(
        `${BASE}/movie-tv/${provider}/media/search?q=${encodeURIComponent("One Piece")}`,
      );
      const j = await r.json();
      const item = j?.data?.[0] ?? j?.results?.[0];
      const opId = item?.id ?? item?.slug;
      if (opId) {
        results.push(await hit(`/movie-tv/${provider}/media/${opId}`));
        results.push(
          await hit(`/movie-tv/${provider}/media/${opId}/servers?s=1&e=1`),
        );
      }
    }
  }

  printResults(results);
  return results;
}

async function testYFlix() {
  printSection("MOVIE-TV /yflix (search by title)");
  const results: Result[] = [];
  results.push(await hit("/movie-tv/yflix"));
  results.push(await hit("/movie-tv/yflix/home"));
  results.push(await hit(`/movie-tv/yflix/search?query=${encodeURIComponent("Super Mario Galaxy")}&type=movie`));
  results.push(await hit(`/movie-tv/yflix/search?query=${encodeURIComponent("Family Guy")}&type=tv`));
  results.push(await hit(`/movie-tv/yflix/search?query=${encodeURIComponent("One Piece")}&type=tv`));
  printResults(results);
  return results;
}

async function testAnimeProviders() {
  printSection("ANIME providers (One Piece via search → info → sources)");
  const results: Result[] = [];

  results.push(await hit("/anime"));

  // animepahe
  results.push(await hit("/anime/animepahe/search/one%20piece"));
  const apSearch = await fetch(`${BASE}/anime/animepahe/search/one%20piece`);
  if (apSearch.ok) {
    const apJson = await apSearch.json();
    const apId = apJson?.results?.[0]?.id ?? apJson?.data?.[0]?.id;
    if (apId) {
      results.push(await hit(`/anime/animepahe/info/${apId}`));
      results.push(await hit(`/anime/animepahe/episodes/${apId}`));
      results.push(await hit(`/anime/animepahe/episode/${apId}/1`));
    }
  }

  // animekai
  results.push(await hit("/anime/animekai/search/one%20piece"));
  const akSearch = await fetch(`${BASE}/anime/animekai/search/one%20piece`);
  if (akSearch.ok) {
    const akJson = await akSearch.json();
    const akId = akJson?.results?.[0]?.id ?? akJson?.data?.[0]?.id;
    if (akId) {
      results.push(await hit(`/anime/animekai/info?id=${akId}`));
      const infoRes = await fetch(`${BASE}/anime/animekai/info?id=${akId}`);
      const info = await infoRes.json();
      const epId = info?.episodes?.[0]?.id ?? info?.data?.episodes?.[0]?.id;
      if (epId) {
        results.push(await hit(`/anime/animekai/watch/${epId}`));
        results.push(await hit(`/anime/animekai/servers/${epId}`));
      }
    }
  }

  // toonstream
  results.push(await hit("/anime/toonstream/home"));
  results.push(await hit("/anime/toonstream/search/one%20piece"));
  const tsSearch = await fetch(`${BASE}/anime/toonstream/search/one%20piece`);
  if (tsSearch.ok) {
    const tsJson = await tsSearch.json();
    const slug = tsJson?.data?.[0]?.slug ?? tsJson?.results?.[0]?.slug;
    if (slug) {
      results.push(await hit(`/anime/toonstream/series/info/${slug}`));
      results.push(await hit(`/anime/toonstream/episode/sources/${slug}`));
    }
  }

  // animesalt
  results.push(await hit("/anime/animesalt/home"));
  results.push(await hit("/anime/animesalt/search/one%20piece"));
  const asSearch = await fetch(`${BASE}/anime/animesalt/search/one%20piece`);
  if (asSearch.ok) {
    const asJson = await asSearch.json();
    const slug = asJson?.data?.[0]?.slug ?? asJson?.results?.[0]?.slug;
    if (slug) {
      results.push(await hit(`/anime/animesalt/series/info/${slug}`));
      results.push(await hit(`/anime/animesalt/episode/sources/${slug}`));
    }
  }

  printResults(results);
  return results;
}

async function testCoreAndProxy() {
  printSection("CORE & PROXY overview");
  const results: Result[] = [];
  results.push(await hit("/"));
  results.push(await hit("/proxy"));
  results.push(await hit("/stream"));
  results.push(await hit("/movie-tv"));
  printResults(results);
  return results;
}

async function main() {
  console.log(`Testing Cooren API at ${BASE}`);
  console.log(`TMDB IDs: One Piece=${TITLES.onePiece.tmdb}, Family Guy=${TITLES.familyGuy.tmdb}, Mario Galaxy=${TITLES.marioGalaxy.tmdb}`);

  const all: Result[] = [];
  all.push(...(await testCoreAndProxy()));
  all.push(...(await testMappings()));
  all.push(...(await testStreamProvider("vidcore")));
  all.push(...(await testStreamProvider("vidfast")));
  all.push(...(await testPrimesrc()));
  all.push(...(await testYFlix()));
  all.push(...(await testHiMoviesFlixHQ()));
  all.push(...(await testAnimeProviders()));

  printSection("OVERALL SUMMARY");
  const passed = all.filter((r) => r.ok).length;
  const failed = all.filter((r) => !r.ok);
  console.log(`Total: ${passed}/${all.length} passed (${((passed / all.length) * 100).toFixed(1)}%)`);
  if (failed.length) {
    console.log("\nFailed endpoints:");
    for (const f of failed) {
      console.log(`  ❌ [${f.status || "ERR"}] ${f.endpoint}${f.error ? ` — ${f.error}` : ""}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
