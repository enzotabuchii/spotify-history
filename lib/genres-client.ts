// Looks up artist tags on MusicBrainz from the browser, for uploaded histories.
// Same idea as scripts/fetch-genres.mjs, minus the Deezer fallback (Deezer's API
// doesn't allow browser requests). Results are cached in localStorage.
import type { GenreCache } from "./build";

const KEY = "mb-genres-v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function loadGenreCache(): GenreCache {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function saveGenreCache(c: GenreCache) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // storage full or blocked: the lookup still works for this visit
  }
}

async function lookup(name: string, signal: AbortSignal): Promise<GenreCache[string]> {
  const q = encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`);
  const url = `https://musicbrainz.org/ws/2/artist?query=${q}&fmt=json&limit=5`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
    if (res.status === 503 || res.status === 429) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`MusicBrainz respondeu ${res.status}`);
    const json = await res.json();
    type Cand = { name: string; score: number; country?: string; tags?: { name: string; count: number }[] };
    const cands = ((json.artists || []) as Cand[]).filter((a) => a.score >= 85);
    const exact = cands.filter((a) => norm(a.name) === norm(name));
    const best = exact.find((a) => a.tags?.length) || exact[0] || cands[0];
    if (!best) return { tags: [] };
    return {
      tags: (best.tags || [])
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((t) => [t.name, t.count] as [string, number]),
      country: best.country || null,
    };
  }
  return { tags: [] };
}

/**
 * Fetches tags for the given artists (skipping cached ones), one per second as
 * MusicBrainz asks. Calls onUpdate with the growing cache every few artists.
 */
export async function fetchGenres(
  artists: string[],
  onUpdate: (cache: GenreCache, done: number) => void,
  signal: AbortSignal,
): Promise<GenreCache> {
  const cache = loadGenreCache();
  let done = 0;
  for (const name of artists) {
    if (signal.aborted) break;
    if (!(name in cache)) {
      try {
        cache[name] = await lookup(name, signal);
      } catch (e) {
        if (signal.aborted) break;
        console.warn(`gênero de "${name}":`, e);
      }
      await sleep(1100);
    }
    done++;
    if (done % 5 === 0 || done === artists.length) {
      saveGenreCache(cache);
      onUpdate({ ...cache }, done);
    }
  }
  saveGenreCache(cache);
  return cache;
}
