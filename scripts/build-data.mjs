// Builds public/data/history.json: a compact, columnar dataset for the site.
// Strips IPs and other fields the site doesn't need. Merges data/genres.json
// (from fetch-genres.mjs) when present.
// Usage: node scripts/build-data.mjs
import fs from "node:fs";
import path from "node:path";
import { loadPlays } from "./load-history.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/data/history.json");
const GENRES = path.join(ROOT, "data/genres.json");

// Broad genre buckets. Each raw MusicBrainz tag is matched against these keyword
// lists in order (first hit wins); the bucket with the most tag votes wins.
const BUCKETS = [
  ["Pop", ["dance-pop", "dance pop", "teen pop", "electropop", "synthpop", "synth-pop", "pop rap"]],
  ["Sertanejo", ["sertanejo"]],
  ["Funk BR", ["funk carioca", "baile funk", "funk brasileiro", "brazilian funk", "funk ostenta", "funk paulista", "favela"]],
  ["Pagode / Samba", ["pagode", "samba"]],
  ["MPB / Bossa Nova", ["mpb", "bossa nova", "música popular brasileira", "musica popular brasileira", "tropicália", "tropicalia"]],
  ["Forró / Axé / Brega", ["forró", "forro", "piseiro", "arrocha", "axé", "axe", "brega", "frevo", "baião"]],
  ["Gospel", ["gospel", "christian", "worship", "cristã", "louvor"]],
  ["K-pop / J-pop", ["k-pop", "kpop", "j-pop", "jpop", "anime", "j-rock", "korean"]],
  ["Latina", ["reggaeton", "latin", "cumbia", "bachata", "salsa", "urbano"]],
  ["Hip-Hop / Rap", ["hip hop", "hip-hop", "rap", "trap", "drill", "grime", "boom bap"]],
  ["Metal", ["metal", "metalcore", "deathcore"]],
  ["Rock", ["rock", "punk", "grunge", "emo", "hardcore", "post-hardcore", "shoegaze", "new wave", "alternative", "indie"]],
  ["Eletrônica", ["electronic", "electro", "house", "techno", "edm", "trance", "dubstep", "drum and bass", "dnb", "eurodance", "dance", "phonk", "lo-fi", "lofi", "ambient", "big room"]],
  ["R&B / Soul / Funk", ["r&b", "rnb", "soul", "funk", "disco", "motown", "contemporary r&b"]],
  ["Reggae / Ska", ["reggae", "ska", "dancehall", "dub"]],
  ["Jazz / Blues", ["jazz", "blues", "swing"]],
  ["Clássica / Trilha", ["classical", "soundtrack", "score", "video game", "orchestral", "opera", "musical"]],
  ["Country / Folk", ["country", "folk", "bluegrass", "americana", "singer-songwriter"]],
  ["Pop", ["pop", "brazilian"]],
];
const UNKNOWN = "Sem gênero identificado";

function bucketFor(tags) {
  const votes = new Map();
  tags.forEach(([tag, count], i) => {
    const t = tag.toLowerCase();
    const hit = BUCKETS.find(([, kws]) => kws.some((k) => t.includes(k)));
    if (!hit) return;
    // Higher tag counts weigh more; earlier tags break ties.
    votes.set(hit[0], (votes.get(hit[0]) || 0) + Math.max(1, count) + (tags.length - i) * 0.01);
  });
  if (!votes.size) return UNKNOWN;
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function platformOf(p) {
  const s = (p || "").toLowerCase();
  if (s.startsWith("android")) return "Android";
  if (s.startsWith("ios") || s.includes("iphone") || s.includes("ipad")) return "iOS";
  if (s.startsWith("windows")) return "Windows";
  if (s.startsWith("linux")) return "Linux";
  if (s.startsWith("os x") || s.includes("mac")) return "macOS";
  if (s.includes("tizen") || s.includes("webos") || s.includes("tv") || s.includes("cast")) return "TV";
  if (s.includes("web") || s.includes("browser")) return "Web";
  return "Outros";
}

class Dict {
  list = [];
  map = new Map();
  id(v) {
    let i = this.map.get(v);
    if (i === undefined) {
      i = this.list.length;
      this.list.push(v);
      this.map.set(v, i);
    }
    return i;
  }
}

const plays = loadPlays();
const genreCache = fs.existsSync(GENRES) ? JSON.parse(fs.readFileSync(GENRES, "utf8")) : {};

const artists = new Dict();
const albums = new Dict();
const genres = new Dict();
const platforms = new Dict();
const reasons = new Dict();
const trackIdx = new Map(); // uri -> index
const tracks = []; // [name, artist, album, durMs, maxPlayedMs]

const cols = { t: [], k: [], ms: [], f: [], rs: [], re: [], p: [] };
let prevT = 0;
for (const r of plays) {
  const a = artists.id(r.master_metadata_album_artist_name);
  let k = trackIdx.get(r.spotify_track_uri);
  if (k === undefined) {
    k = tracks.length;
    trackIdx.set(r.spotify_track_uri, k);
    tracks.push([r.master_metadata_track_name, a, albums.id(r.master_metadata_album_album_name || ""), 0, 0]);
  }
  const tr = tracks[k];
  // Duration estimate: longest play that ended because the track finished.
  if (r.reason_end === "trackdone") tr[3] = Math.max(tr[3], r.ms_played);
  tr[4] = Math.max(tr[4], r.ms_played);

  const t = Math.floor(Date.parse(r.ts) / 1000);
  cols.t.push(t - prevT); // delta-encoded
  prevT = t;
  cols.k.push(k);
  cols.ms.push(r.ms_played);
  cols.f.push((r.skipped ? 1 : 0) | (r.shuffle ? 2 : 0) | (r.offline ? 4 : 0) | (r.incognito_mode ? 8 : 0));
  cols.rs.push(reasons.id(r.reason_start || "unknown"));
  cols.re.push(reasons.id(r.reason_end || "unknown"));
  cols.p.push(platforms.id(platformOf(r.platform)));
}

// Deezer genre ids (https://api.deezer.com/genre) -> our buckets.
const DEEZER = {
  132: "Pop", 80: "Sertanejo", 78: "MPB / Bossa Nova", 472: "Hip-Hop / Rap", 116: "Hip-Hop / Rap",
  122: "Latina", 71: "Latina", 152: "Rock", 85: "Rock", 464: "Metal", 113: "Eletrônica", 106: "Eletrônica",
  165: "R&B / Soul / Funk", 169: "R&B / Soul / Funk", 79: "Pagode / Samba", 186: "Gospel",
  76: "Forró / Axé / Brega", 466: "Country / Folk", 144: "Reggae / Ska", 129: "Jazz / Blues",
  153: "Jazz / Blues", 98: "Clássica / Trilha", 173: "Clássica / Trilha", 95: "Infantil",
};

function genreFor(name) {
  const e = genreCache[name];
  if (/folcl[oó]ric/i.test(name)) return "Country / Folk";
  let g = bucketFor(e?.tags || []);
  if (g === UNKNOWN && e?.deezer) {
    const hit = e.deezer.find(([id]) => DEEZER[id]);
    if (hit) g = DEEZER[hit[0]];
  }
  return g;
}

const artistRows = artists.list.map((name) => {
  const tags = genreCache[name]?.tags || [];
  return [name, genres.id(genreFor(name)), tags.slice(0, 3).map(([t]) => t)];
});

const out = {
  generatedAt: new Date().toISOString(),
  genresCovered: Object.keys(genreCache).length,
  artists: artistRows,
  albums: albums.list,
  genres: genres.list,
  platforms: platforms.list,
  reasons: reasons.list,
  tracks,
  plays: cols,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
console.log(`${plays.length} reproduções, ${tracks.length} faixas, ${artists.list.length} artistas -> ${OUT} (${mb} MB)`);
