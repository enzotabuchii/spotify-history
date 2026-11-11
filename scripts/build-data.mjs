// Builds public/data/history.json, the dataset the site loads by default.
// Leaves out IPs and other fields the site doesn't use. Uses data/genres.json
// (from fetch-genres.mjs) when it exists.
// Usage: node scripts/build-data.mjs
import fs from "node:fs";
import path from "node:path";
import { loadPlays } from "./load-history.mjs";
import { buildRaw } from "../lib/build.ts";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/data/history.json");
const GENRES = path.join(ROOT, "data/genres.json");

const plays = loadPlays();
const genreCache = fs.existsSync(GENRES) ? JSON.parse(fs.readFileSync(GENRES, "utf8")) : {};
const out = buildRaw(plays, genreCache);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
console.log(`${plays.length} reproduções, ${out.tracks.length} faixas, ${out.artists.length} artistas -> ${OUT} (${mb} MB)`);
