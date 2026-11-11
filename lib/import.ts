// Reads what someone drops on the page (the my_spotify_data.zip itself, or the
// JSON files inside it) and returns cleaned plays. Runs entirely in the browser:
// nothing is uploaded anywhere.
import { cleanRows, type SpotifyRow } from "./build";

export type ImportResult = {
  rows: SpotifyRow[];
  files: string[]; // files that contributed plays
  basic: boolean; // true when only the short "account data" history was found
};

/** Short history from the "Account data" request: no URIs, albums or skip info. */
type BasicRow = { endTime: string; artistName: string; trackName: string; msPlayed: number };

export async function importFiles(files: File[]): Promise<ImportResult> {
  const named: { name: string; text: () => Promise<string> }[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      for (const e of await unzip(f)) named.push(e);
    } else if (/\.json$/i.test(f.name)) {
      named.push({ name: f.name, text: () => f.text() });
    }
  }
  const candidates = named.filter((e) => /streaming_?history/i.test(base(e.name)) && !/video|podcast/i.test(base(e.name)));
  if (!candidates.length) {
    throw new Error(
      named.length
        ? "Não achei nenhum arquivo de histórico aqui. Os nomes costumam ser Streaming_History_Audio_*.json ou StreamingHistory_music_*.json."
        : "Envie o .zip do Spotify ou os arquivos .json que vêm dentro dele.",
    );
  }

  const extended: SpotifyRow[] = [];
  const basic: SpotifyRow[] = [];
  const used: string[] = [];
  for (const e of candidates) {
    let data: unknown;
    try {
      data = JSON.parse(await e.text());
    } catch {
      throw new Error(`${base(e.name)} não é um JSON válido.`);
    }
    if (!Array.isArray(data) || !data.length) continue;
    const first = data[0] as Record<string, unknown>;
    if ("ts" in first && "ms_played" in first) {
      extended.push(...(data as SpotifyRow[]));
      used.push(base(e.name));
    } else if ("endTime" in first && "msPlayed" in first && "trackName" in first) {
      basic.push(...(data as BasicRow[]).map(fromBasic));
      used.push(base(e.name));
    }
  }

  // If both kinds were sent, the extended one is a superset with more detail.
  const rows = cleanRows(extended.length ? extended : basic);
  if (!rows.length) throw new Error("Os arquivos foram lidos, mas nenhum deles tem músicas tocadas.");
  return { rows, files: used.sort(), basic: !extended.length };
}

function fromBasic(r: BasicRow): SpotifyRow {
  return {
    ts: `${r.endTime.replace(" ", "T")}:00Z`,
    ms_played: r.msPlayed,
    master_metadata_track_name: r.trackName,
    master_metadata_album_artist_name: r.artistName,
    master_metadata_album_album_name: "",
    // No URI in this format; artist + title is the closest thing to a track id.
    spotify_track_uri: `basic:${r.artistName}\u0000${r.trackName}`,
  };
}

const base = (p: string) => p.split("/").pop() || p;

// ---------- minimal zip reader ----------
// Enough for Spotify's export: stored or deflated entries, no zip64, no encryption.
// Uses the browser's DecompressionStream instead of pulling in a library.

async function unzip(file: File): Promise<{ name: string; text: () => Promise<string> }[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // End of central directory: last 22 bytes + up to 64 KB of comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${file.name} não parece ser um .zip válido.`);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  if (p === 0xffffffff) throw new Error("Esse .zip é grande demais para abrir aqui. Extraia e envie os .json diretamente.");

  const utf8 = new TextDecoder();
  const entries: { name: string; text: () => Promise<string> }[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error(`${file.name} está corrompido.`);
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = utf8.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/") || !/\.json$/i.test(name)) continue;
    if (flags & 1) throw new Error("O .zip está protegido por senha.");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = buf.subarray(start, start + size);
    entries.push({ name, text: () => inflate(data, method) });
  }
  return entries;
}

async function inflate(data: Uint8Array, method: number): Promise<string> {
  if (method === 0) return new TextDecoder().decode(data);
  if (method !== 8) throw new Error("Formato de compressão não suportado. Extraia o .zip e envie os .json.");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}
