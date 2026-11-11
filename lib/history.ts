// Data model + aggregations for the Spotify history dashboard (runs in the browser).

type RawData = {
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

export type Dataset = {
  generatedAt: string;
  genresCovered: number;
  artistName: string[];
  artistGenre: Int32Array;
  artistTags: string[][];
  albums: string[];
  genres: string[];
  platforms: string[];
  reasons: string[];
  trackName: string[];
  trackArtist: Int32Array;
  trackAlbum: Int32Array;
  trackDur: Float64Array; // estimated duration (0 = never finished)
  /** play columns, sorted by end time */
  t: Float64Array; // end timestamp, epoch ms
  k: Int32Array; // track index
  ms: Float64Array; // ms played
  f: Uint8Array; // flags: 1 skipped, 2 shuffle, 4 offline, 8 incognito
  rs: Uint8Array;
  re: Uint8Array;
  p: Uint8Array;
  isSkip: Uint8Array;
  /** first play time per artist / track (epoch ms) */
  artistFirst: Float64Array;
  trackFirst: Float64Array;
  n: number;
};

export const MIN_PLAY_MS = 30_000; // Spotify counts a stream after 30 s

export function decode(raw: RawData): Dataset {
  const n = raw.plays.t.length;
  const t = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += raw.plays.t[i];
    t[i] = acc * 1000;
  }
  const k = Int32Array.from(raw.plays.k);
  const re = Uint8Array.from(raw.plays.re);
  const f = Uint8Array.from(raw.plays.f);
  const fwd = raw.reasons.indexOf("fwdbtn");
  const isSkip = new Uint8Array(n);
  for (let i = 0; i < n; i++) isSkip[i] = f[i] & 1 || re[i] === fwd ? 1 : 0;

  const trackArtist = Int32Array.from(raw.tracks.map((x) => x[1]));
  const artistFirst = new Float64Array(raw.artists.length).fill(Infinity);
  const trackFirst = new Float64Array(raw.tracks.length).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const tr = k[i];
    if (trackFirst[tr] === Infinity) trackFirst[tr] = t[i];
    const a = trackArtist[tr];
    if (artistFirst[a] === Infinity) artistFirst[a] = t[i];
  }

  return {
    generatedAt: raw.generatedAt,
    genresCovered: raw.genresCovered,
    artistName: raw.artists.map((a) => a[0]),
    artistGenre: Int32Array.from(raw.artists.map((a) => a[1])),
    artistTags: raw.artists.map((a) => a[2]),
    albums: raw.albums,
    genres: raw.genres,
    platforms: raw.platforms,
    reasons: raw.reasons,
    trackName: raw.tracks.map((x) => x[0]),
    trackArtist,
    trackAlbum: Int32Array.from(raw.tracks.map((x) => x[2])),
    trackDur: Float64Array.from(raw.tracks.map((x) => x[3])),
    t,
    k,
    ms: Float64Array.from(raw.plays.ms),
    f,
    rs: Uint8Array.from(raw.plays.rs),
    re,
    p: Uint8Array.from(raw.plays.p),
    isSkip,
    artistFirst,
    trackFirst,
    n,
  };
}

// ---------- periods ----------

export type Granularity = "day" | "week" | "month" | "year" | "all";

export function periodStart(d: Date, g: Granularity): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  if (g === "week") x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  if (g === "month") x.setDate(1);
  if (g === "year") x.setMonth(0, 1);
  return x;
}

export function shiftPeriod(start: Date, g: Granularity, delta: number): Date {
  const x = new Date(start);
  if (g === "day") x.setDate(x.getDate() + delta);
  if (g === "week") x.setDate(x.getDate() + 7 * delta);
  if (g === "month") x.setMonth(x.getMonth() + delta);
  if (g === "year") x.setFullYear(x.getFullYear() + delta);
  return x;
}

export type Range = { from: number; to: number }; // epoch ms, [from, to)

export function periodRange(ds: Dataset, start: Date, g: Granularity): Range {
  if (g === "all") return { from: -Infinity, to: Infinity };
  return { from: start.getTime(), to: shiftPeriod(start, g, 1).getTime() };
}

const fmtDay = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });
const fmtWeekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtMonth = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

export function periodLabel(start: Date, g: Granularity): string {
  if (g === "all") return "Todo o período";
  if (g === "day") return cap(fmtWeekday.format(start));
  if (g === "week") {
    const end = shiftPeriod(start, "week", 1);
    end.setDate(end.getDate() - 1);
    return `${fmtDay.format(start)} – ${fmtDay.format(end)}`;
  }
  if (g === "month") return cap(fmtMonth.format(start));
  return String(start.getFullYear());
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- selection ----------

export type Filters = { artist: number | null; genre: number | null };

function lowerBound(arr: Float64Array, v: number) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Indices of plays inside range matching filters. */
export function select(ds: Dataset, r: Range, fl: Filters): Int32Array {
  const a = r.from === -Infinity ? 0 : lowerBound(ds.t, r.from);
  const b = r.to === Infinity ? ds.n : lowerBound(ds.t, r.to);
  const out = new Int32Array(Math.max(0, b - a));
  let j = 0;
  for (let i = a; i < b; i++) {
    const ar = ds.trackArtist[ds.k[i]];
    if (fl.artist !== null && ar !== fl.artist) continue;
    if (fl.genre !== null && ds.artistGenre[ar] !== fl.genre) continue;
    out[j++] = i;
  }
  return out.subarray(0, j);
}

// ---------- aggregations ----------

export type Totals = {
  ms: number;
  plays: number;
  streams: number; // >= 30 s
  tracks: number;
  artists: number;
  skips: number;
  days: number;
};

const dayKey = (ms: number) => {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
};

export function totals(ds: Dataset, idx: Int32Array): Totals {
  let ms = 0;
  let streams = 0;
  let skips = 0;
  const tr = new Set<number>();
  const ar = new Set<number>();
  const days = new Set<number>();
  for (const i of idx) {
    ms += ds.ms[i];
    if (ds.ms[i] >= MIN_PLAY_MS) streams++;
    skips += ds.isSkip[i];
    tr.add(ds.k[i]);
    ar.add(ds.trackArtist[ds.k[i]]);
    days.add(dayKey(ds.t[i]));
  }
  return { ms, plays: idx.length, streams, tracks: tr.size, artists: ar.size, skips, days: days.size };
}

export type RankRow = { id: number; ms: number; streams: number; plays: number; skips: number };
export type Dim = "artist" | "track" | "album" | "genre" | "platform";

export function rank(ds: Dataset, idx: Int32Array, dim: Dim): RankRow[] {
  const m = new Map<number, RankRow>();
  for (const i of idx) {
    const tr = ds.k[i];
    const id =
      dim === "track"
        ? tr
        : dim === "artist"
          ? ds.trackArtist[tr]
          : dim === "album"
            ? ds.trackAlbum[tr]
            : dim === "genre"
              ? ds.artistGenre[ds.trackArtist[tr]]
              : ds.p[i];
    let row = m.get(id);
    if (!row) m.set(id, (row = { id, ms: 0, streams: 0, plays: 0, skips: 0 }));
    row.ms += ds.ms[i];
    row.plays++;
    row.skips += ds.isSkip[i];
    if (ds.ms[i] >= MIN_PLAY_MS) row.streams++;
  }
  return [...m.values()];
}

export type Bucket = { start: Date; label: string; short: string; ms: number; streams: number };

/** Time series for the period, with a sensible bucket size per granularity. */
export function timeline(ds: Dataset, idx: Int32Array, start: Date, g: Granularity): { unit: Granularity | "hour"; buckets: Bucket[] } {
  const unit: Granularity | "hour" = g === "day" ? "hour" : g === "week" || g === "month" ? "day" : g === "year" ? "week" : "month";
  let from: Date;
  let to: Date;
  if (g === "all") {
    if (!idx.length) return { unit, buckets: [] };
    from = periodStart(new Date(ds.t[idx[0]]), "month");
    to = shiftPeriod(periodStart(new Date(ds.t[idx[idx.length - 1]]), "month"), "month", 1);
  } else if (g === "year") {
    from = periodStart(start, "week");
    to = shiftPeriod(start, "year", 1);
  } else {
    from = start;
    to = shiftPeriod(start, g, 1);
  }
  const buckets: Bucket[] = [];
  const step = (d: Date) => {
    const x = new Date(d);
    if (unit === "hour") x.setHours(x.getHours() + 1);
    else if (unit === "day") x.setDate(x.getDate() + 1);
    else if (unit === "week") x.setDate(x.getDate() + 7);
    else x.setMonth(x.getMonth() + 1);
    return x;
  };
  const fShortMonth = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });
  const fDay = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
  const fFull = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  for (let d = new Date(from); d < to; d = step(d)) {
    let label: string;
    let short: string;
    if (unit === "hour") {
      label = `${d.getHours()}h – ${d.getHours() + 1}h`;
      short = `${d.getHours()}h`;
    } else if (unit === "day") {
      label = cap(fFull.format(d));
      short = String(d.getDate());
    } else if (unit === "week") {
      label = `Semana de ${fDay.format(d)}`;
      short = fDay.format(d);
    } else {
      label = cap(fmtMonth.format(d));
      short = fShortMonth.format(d);
    }
    buckets.push({ start: d, label, short, ms: 0, streams: 0 });
  }
  const starts = Float64Array.from(buckets.map((b) => b.start.getTime()));
  for (const i of idx) {
    const s = ds.t[i] - ds.ms[i]; // attribute to when the play started
    let b = lowerBound(starts, s + 1) - 1;
    if (b < 0) b = 0;
    if (b >= buckets.length) continue;
    buckets[b].ms += ds.ms[i];
    if (ds.ms[i] >= MIN_PLAY_MS) buckets[b].streams++;
  }
  return { unit, buckets };
}

/** 7 × 24 matrix of minutes, weekday 0 = Monday. */
export function weekHourMatrix(ds: Dataset, idx: Int32Array): number[][] {
  const m = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const i of idx) {
    const d = new Date(ds.t[i] - ds.ms[i]);
    m[(d.getDay() + 6) % 7][d.getHours()] += ds.ms[i];
  }
  return m;
}

// ---------- curiosities ----------

export type Session = { start: number; end: number; plays: number; ms: number };

export type Curiosities = {
  longestSession: Session | null;
  busiestDay: { day: number; ms: number } | null;
  streak: { days: number; from: number; to: number } | null;
  repeat: { track: number; day: number; count: number } | null;
  nightShare: number; // 0h–5h
  shuffleShare: number;
  offlineShare: number;
  avgSkipSec: number;
  discoveries: { artist: number; first: number; ms: number }[];
  newTracks: number;
  firstPlay: number | null;
  lastPlay: number | null;
  favoriteHour: number | null;
  favoriteWeekday: number | null;
};

const SESSION_GAP = 20 * 60_000;

export function curiosities(ds: Dataset, idx: Int32Array, r: Range): Curiosities {
  let session: Session | null = null;
  let best: Session | null = null;
  const dayMs = new Map<number, number>();
  const repeat = new Map<string, number>();
  let night = 0;
  let shuffle = 0;
  let offline = 0;
  let total = 0;
  let skipMs = 0;
  let skipN = 0;
  const hour = new Array(24).fill(0);
  const wd = new Array(7).fill(0);
  const artistMs = new Map<number, number>();
  const tracksSeen = new Set<number>();

  for (const i of idx) {
    const ms = ds.ms[i];
    const end = ds.t[i];
    const start = end - ms;
    total += ms;
    if (!session || start - session.end > SESSION_GAP) {
      if (session && (!best || session.ms > best.ms)) best = session;
      session = { start, end, plays: 0, ms: 0 };
    }
    session.end = end;
    session.plays++;
    session.ms += ms;

    const sd = new Date(start);
    const dk = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate()).getTime();
    dayMs.set(dk, (dayMs.get(dk) || 0) + ms);
    if (ms >= MIN_PLAY_MS) {
      const key = `${ds.k[i]}|${dk}`;
      repeat.set(key, (repeat.get(key) || 0) + 1);
    }
    if (sd.getHours() < 5) night += ms;
    if (ds.f[i] & 2) shuffle += ms;
    if (ds.f[i] & 4) offline += ms;
    if (ds.isSkip[i]) {
      skipMs += ms;
      skipN++;
    }
    hour[sd.getHours()] += ms;
    wd[(sd.getDay() + 6) % 7] += ms;
    const a = ds.trackArtist[ds.k[i]];
    if (ds.artistFirst[a] >= r.from && ds.artistFirst[a] < r.to) artistMs.set(a, (artistMs.get(a) || 0) + ms);
    if (ds.trackFirst[ds.k[i]] >= r.from && ds.trackFirst[ds.k[i]] < r.to) tracksSeen.add(ds.k[i]);
  }
  if (session && (!best || session.ms > best.ms)) best = session;

  let busiest: Curiosities["busiestDay"] = null;
  for (const [day, ms] of dayMs) if (!busiest || ms > busiest.ms) busiest = { day, ms };

  // Longest run of consecutive days with any listening.
  const days = [...dayMs.keys()].sort((a, b) => a - b);
  let streak: Curiosities["streak"] = null;
  let runStart = 0;
  for (let j = 0; j < days.length; j++) {
    const prev = days[j - 1];
    const consecutive = j > 0 && Math.round((days[j] - prev) / 86_400_000) === 1;
    if (!consecutive) runStart = j;
    const len = j - runStart + 1;
    if (!streak || len > streak.days) streak = { days: len, from: days[runStart], to: days[j] };
  }

  let rep: Curiosities["repeat"] = null;
  for (const [key, count] of repeat) {
    if (!rep || count > rep.count) {
      const [tr, day] = key.split("|").map(Number);
      rep = { track: tr, day, count };
    }
  }

  const argmax = (a: number[]) => (a.some((v) => v > 0) ? a.indexOf(Math.max(...a)) : null);

  return {
    longestSession: best,
    busiestDay: busiest,
    streak,
    repeat: rep && rep.count > 1 ? rep : null,
    nightShare: total ? night / total : 0,
    shuffleShare: total ? shuffle / total : 0,
    offlineShare: total ? offline / total : 0,
    avgSkipSec: skipN ? skipMs / skipN / 1000 : 0,
    discoveries: [...artistMs.entries()]
      .map(([artist, ms]) => ({ artist, ms, first: ds.artistFirst[artist] }))
      .sort((a, b) => b.ms - a.ms),
    newTracks: tracksSeen.size,
    firstPlay: idx.length ? idx[0] : null,
    lastPlay: idx.length ? idx[idx.length - 1] : null,
    favoriteHour: argmax(hour),
    favoriteWeekday: argmax(wd),
  };
}

// ---------- formatting ----------

export function fmtDuration(ms: number): string {
  const min = ms / 60_000;
  if (min < 1) return `${Math.round(ms / 1000)} s`;
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 48) return `${Math.floor(h)} h ${Math.round(min % 60)} min`;
  return `${Math.round(h).toLocaleString("pt-BR")} h`;
}

export function fmtClock(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export const fmtInt = (n: number) => n.toLocaleString("pt-BR");
export const fmtPct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export const fmtDate = (ms: number) => fmtDay.format(new Date(ms));
export const fmtDateTime = (ms: number) =>
  new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
