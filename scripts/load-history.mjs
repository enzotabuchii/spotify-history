// Reads the Spotify "Extended streaming history" export from disk.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { cleanRows, artistsByTime } from "../lib/build.ts";

export { artistsByTime };

export const DEFAULT_SRC = path.join(
  os.homedir(),
  "Downloads/my_spotify_data/Spotify Extended Streaming History",
);

/** Music plays only (podcasts, audiobooks and video are dropped), without duplicates, sorted by time. */
export function loadPlays(srcDir = process.env.SPOTIFY_DATA_DIR || DEFAULT_SRC) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(
      `Pasta não encontrada: ${srcDir}\nExtraia o my_spotify_data.zip ou aponte SPOTIFY_DATA_DIR para a pasta certa.`,
    );
  }
  const files = fs
    .readdirSync(srcDir)
    .filter((f) => /^Streaming_History_Audio_.*\.json$/.test(f))
    .sort();
  return cleanRows(files.flatMap((f) => JSON.parse(fs.readFileSync(path.join(srcDir, f), "utf8"))));
}
