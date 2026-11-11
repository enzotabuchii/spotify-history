// Looks up artist tags on MusicBrainz (no API key needed) and caches them in
// data/genres.json. Resumable: re-running only fetches artists not yet cached.
// Usage: node scripts/fetch-genres.mjs [maxArtists=1000]
import fs from "node:fs";
import path from "node:path";
import { loadPlays, artistsByTime } from "./load-history.mjs";

const OUT = path.join(import.meta.dirname, "../data/genres.json");
const LIMIT = Number(process.argv[2] || 1000);
const UA = "spotify-history-viz/0.1 (personal project)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const artists = artistsByTime(loadPlays()).slice(0, LIMIT);
const todo = artists.filter((a) => !(a in cache));
console.log(`${artists.length} artistas, ${todo.length} a buscar`);

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function lookup(name) {
  const q = encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`);
  const url = `https://musicbrainz.org/ws/2/artist?query=${q}&fmt=json&limit=5`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status === 503 || res.status === 429) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const cands = (json.artists || []).filter((a) => a.score >= 85);
    // Prefer exact name match that has tags, else the best exact match.
    const exact = cands.filter((a) => norm(a.name) === norm(name));
    const best = exact.find((a) => a.tags?.length) || exact[0] || cands[0];
    if (!best) return { tags: [] };
    return {
      tags: (best.tags || [])
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((t) => [t.name, t.count]),
      country: best.country || null,
    };
  }
  return { tags: [] };
}

let n = 0;
for (const name of todo) {
  try {
    cache[name] = await lookup(name);
  } catch (e) {
    console.error(`erro em "${name}": ${e.message}`);
  }
  if (++n % 20 === 0 || n === todo.length) {
    fs.writeFileSync(OUT, JSON.stringify(cache));
    console.log(`${n}/${todo.length}`);
  }
  await sleep(1100); // MusicBrainz rate limit: 1 req/s
}
fs.writeFileSync(OUT, JSON.stringify(cache));
console.log("pronto");
