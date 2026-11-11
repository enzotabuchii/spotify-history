// Turns raw Spotify "Extended streaming history" rows into the compact, columnar
// dataset the dashboard reads. Shared by scripts/build-data.mjs (Node) and the
// upload flow in the browser, so keep it free of imports and non-erasable TS syntax.

export type SpotifyRow = {
  ts: string;
  ms_played: number;
  platform?: string | null;
  master_metadata_track_name?: string | null;
  master_metadata_album_artist_name?: string | null;
  master_metadata_album_album_name?: string | null;
  spotify_track_uri?: string | null;
  reason_start?: string | null;
  reason_end?: string | null;
  shuffle?: boolean | null;
  skipped?: boolean | null;
  offline?: boolean | null;
  incognito_mode?: boolean | null;
};

/** artist name -> MusicBrainz tags ([tag, votes]) and optional Deezer genre ids ([id, count]). */
export type GenreCache = Record<string, { tags?: [string, number][]; deezer?: [number, number][]; country?: string | null }>;

export type RawData = {
  generatedAt: string;
  genresCovered: number;
  artists: [name: string, genre: number, tags: string[]][];
  albums: string[];
  genres: string[];
  platforms: string[];
  reasons: string[];
  tracks: [name: string, artist: number, album: number, durMs: number, maxPlayedMs: number][];
  plays: { t: number[]; k: number[]; ms: number[]; f: number[]; rs: number[]; re: number[]; p: number[] };
};

export const UNKNOWN_GENRE = "Sem gênero identificado";

/** Keeps music plays only (drops podcasts/audiobooks/video), removes duplicates and sorts by time. */
export function cleanRows(rows: SpotifyRow[]): SpotifyRow[] {
  const seen = new Set<string>();
  const out: SpotifyRow[] = [];
  for (const r of rows) {
    if (!r || !r.spotify_track_uri || !r.master_metadata_track_name || !r.ts) continue;
    const key = `${r.ts}|${r.spotify_track_uri}|${r.ms_played}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return out;
}

/** Artists ordered by total listening time (desc). */
export function artistsByTime(rows: SpotifyRow[]): string[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const a = r.master_metadata_album_artist_name || "";
    m.set(a, (m.get(a) || 0) + r.ms_played);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
}

// Broad genre buckets. Each raw MusicBrainz tag is matched against these keyword
// lists in order (first hit wins); the bucket with the most tag votes wins.
const BUCKETS: [string, string[]][] = [
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

function bucketFor(tags: [string, number][]): string {
  const votes = new Map<string, number>();
  tags.forEach(([tag, count], i) => {
    const t = tag.toLowerCase();
    const hit = BUCKETS.find(([, kws]) => kws.some((k) => t.includes(k)));
    if (!hit) return;
    // Higher tag counts weigh more; earlier tags break ties.
    votes.set(hit[0], (votes.get(hit[0]) || 0) + Math.max(1, count) + (tags.length - i) * 0.01);
  });
  if (!votes.size) return UNKNOWN_GENRE;
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Deezer genre ids (https://api.deezer.com/genre) -> our buckets.
const DEEZER: Record<number, string> = {
  132: "Pop", 80: "Sertanejo", 78: "MPB / Bossa Nova", 472: "Hip-Hop / Rap", 116: "Hip-Hop / Rap",
  122: "Latina", 71: "Latina", 152: "Rock", 85: "Rock", 464: "Metal", 113: "Eletrônica", 106: "Eletrônica",
  165: "R&B / Soul / Funk", 169: "R&B / Soul / Funk", 79: "Pagode / Samba", 186: "Gospel",
  76: "Forró / Axé / Brega", 466: "Country / Folk", 144: "Reggae / Ska", 129: "Jazz / Blues",
  153: "Jazz / Blues", 98: "Clássica / Trilha", 173: "Clássica / Trilha", 95: "Infantil",
};

function genreFor(name: string, cache: GenreCache): string {
  if (/folcl[oó]ric/i.test(name)) return "Country / Folk";
  const e = cache[name];
  let g = bucketFor(e?.tags || []);
  if (g === UNKNOWN_GENRE && e?.deezer) {
    const hit = e.deezer.find(([id]) => DEEZER[id]);
    if (hit) g = DEEZER[hit[0]];
  }
  return g;
}

function platformOf(p: string | null | undefined): string {
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

function dict() {
  const list: string[] = [];
  const map = new Map<string, number>();
  return {
    list,
    id(v: string) {
      let i = map.get(v);
      if (i === undefined) {
        i = list.length;
        list.push(v);
        map.set(v, i);
      }
      return i;
    },
  };
}

/** Builds the dataset. `rows` must already be cleaned (see cleanRows). */
export function buildRaw(rows: SpotifyRow[], genreCache: GenreCache = {}): RawData {
  const artists = dict();
  const albums = dict();
  const genres = dict();
  const platforms = dict();
  const reasons = dict();
  const trackIdx = new Map<string, number>();
  const tracks: RawData["tracks"] = [];
  const cols: RawData["plays"] = { t: [], k: [], ms: [], f: [], rs: [], re: [], p: [] };

  let prevT = 0;
  for (const r of rows) {
    const a = artists.id(r.master_metadata_album_artist_name || "");
    const uri = r.spotify_track_uri as string;
    let k = trackIdx.get(uri);
    if (k === undefined) {
      k = tracks.length;
      trackIdx.set(uri, k);
      tracks.push([r.master_metadata_track_name as string, a, albums.id(r.master_metadata_album_album_name || ""), 0, 0]);
    }
    const tr = tracks[k];
    // The export has no track length. Best guess: the longest play that ended because the track finished.
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

  return {
    generatedAt: new Date().toISOString(),
    genresCovered: artists.list.filter((name) => name in genreCache).length,
    artists: artists.list.map((name) => [
      name,
      genres.id(genreFor(name, genreCache)),
      (genreCache[name]?.tags || []).slice(0, 3).map(([t]) => t),
    ]),
    albums: albums.list,
    genres: genres.list,
    platforms: platforms.list,
    reasons: reasons.list,
    tracks,
    plays: cols,
  };
}
