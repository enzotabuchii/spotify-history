// Shared loader for the Spotify Extended Streaming History export.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const DEFAULT_SRC = path.join(
  os.homedir(),
  "Downloads/my_spotify_data/Spotify Extended Streaming History",
);

/** Returns de-duplicated music plays (episodes/audiobooks/video are dropped). */
export function loadPlays(srcDir = process.env.SPOTIFY_DATA_DIR || DEFAULT_SRC) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(
      `Pasta não encontrada: ${srcDir}\nExtraia my_spotify_data.zip ou defina SPOTIFY_DATA_DIR.`,
    );
  }
  const files = fs
    .readdirSync(srcDir)
    .filter((f) => /^Streaming_History_Audio_.*\.json$/.test(f))
    .sort();
  const seen = new Set();
  const plays = [];
  for (const f of files) {
    const rows = JSON.parse(fs.readFileSync(path.join(srcDir, f), "utf8"));
    for (const r of rows) {
      if (!r.spotify_track_uri || !r.master_metadata_track_name) continue;
      const key = `${r.ts}|${r.spotify_track_uri}|${r.ms_played}`;
      if (seen.has(key)) continue;
      seen.add(key);
      plays.push(r);
    }
  }
  plays.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return plays;
}

/** Artists ordered by total listening time (desc). */
export function artistsByTime(plays) {
  const m = new Map();
  for (const p of plays) {
    const a = p.master_metadata_album_artist_name;
    m.set(a, (m.get(a) || 0) + p.ms_played);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
}
