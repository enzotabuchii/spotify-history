"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  WEEKDAYS,
  cap,
  curiosities,
  decode,
  fmtClock,
  fmtDate,
  fmtDateTime,
  fmtDuration,
  fmtInt,
  fmtPct,
  periodLabel,
  periodRange,
  periodStart,
  rank,
  select,
  shiftPeriod,
  timeline,
  totals,
  weekHourMatrix,
  type Dataset,
  type Filters,
  type Granularity,
  type RankRow,
  type Totals,
} from "@/lib/history";
import { BarList, Heatmap, TimeChart, type BarRow, type Metric } from "./charts";
import { Hero } from "./hero";

const GRANS: [Granularity, string][] = [
  ["day", "Dia"],
  ["week", "Semana"],
  ["month", "Mês"],
  ["year", "Ano"],
  ["all", "Todo o período"],
];

export default function Dashboard() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/history.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => setDs(decode(raw)))
      .catch((e) => setError(String(e)));
  }, []);

  if (error)
    return (
      <Shell>
        <div className="rounded-xl border border-line bg-card p-6">
          <h2 className="text-lg font-semibold">Dados não encontrados</h2>
          <p className="mt-2 text-ink-2">
            Gere o arquivo com <code className="rounded bg-surface-2 px-1">npm run data</code> (lê o export extraído de{" "}
            <code className="rounded bg-surface-2 px-1">my_spotify_data.zip</code>).
          </p>
          <p className="mt-2 text-xs text-muted">{error}</p>
        </div>
      </Shell>
    );
  if (!ds)
    return (
      <Shell>
        <p className="py-24 text-center text-ink-2">Carregando seu histórico…</p>
      </Shell>
    );
  return <Loaded ds={ds} />;
}

function Shell({ ds = null, children }: { ds?: Dataset | null; children: ReactNode }) {
  return (
    <>
      <Hero ds={ds} />
      <main className="mx-auto w-full max-w-6xl overflow-x-clip px-4 pb-8 sm:px-6">{children}</main>
    </>
  );
}

function Loaded({ ds }: { ds: Dataset }) {
  const firstT = ds.t[0];
  const lastT = ds.t[ds.n - 1];
  const [g, setG] = useState<Granularity>("year");
  const [anchor, setAnchor] = useState<Date>(() => new Date(lastT));
  const [filters, setFilters] = useState<Filters>({ artist: null, genre: null });
  const [metric, setMetric] = useState<Metric>("ms");

  const start = useMemo(() => periodStart(anchor, g), [anchor, g]);
  const range = useMemo(() => periodRange(ds, start, g), [ds, start, g]);
  const idx = useMemo(() => select(ds, range, filters), [ds, range, filters]);

  const prevIdx = useMemo(
    () => (g === "all" ? null : select(ds, periodRange(ds, shiftPeriod(start, g, -1), g), filters)),
    [ds, start, g, filters],
  );
  const tot = useMemo(() => totals(ds, idx), [ds, idx]);
  const prevTot = useMemo(() => (prevIdx ? totals(ds, prevIdx) : null), [ds, prevIdx]);
  const series = useMemo(() => timeline(ds, idx, start, g), [ds, idx, start, g]);
  const matrix = useMemo(() => weekHourMatrix(ds, idx), [ds, idx]);
  const cur = useMemo(() => curiosities(ds, idx, range), [ds, idx, range]);
  const ranks = useMemo(
    () => ({
      artist: rank(ds, idx, "artist"),
      track: rank(ds, idx, "track"),
      album: rank(ds, idx, "album"),
      genre: rank(ds, idx, "genre"),
      platform: rank(ds, idx, "platform"),
    }),
    [ds, idx],
  );

  const canPrev = g !== "all" && start.getTime() > firstT;
  const canNext = g !== "all" && shiftPeriod(start, g, 1).getTime() <= lastT;
  const sortBy = (rows: RankRow[]) => [...rows].sort((a, b) => b[metric] - a[metric]).filter((r) => r[metric] > 0);

  const pickArtist = (a: number) => setFilters((f) => ({ ...f, artist: f.artist === a ? null : a }));
  const pickGenre = (gi: number) => setFilters((f) => ({ ...f, genre: f.genre === gi ? null : gi }));

  const drill = (b: { start: Date }) => {
    const next: Partial<Record<Granularity, Granularity>> = { all: "month", year: "week", month: "day", week: "day" };
    const ng = next[g];
    if (!ng) return;
    setAnchor(b.start);
    setG(ng);
  };

  return (
    <Shell ds={ds}>
      {/* Controls */}
      <div className="z-20 -mx-4 sm:sticky sm:top-0 mb-6 border-b border-line bg-page/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={g} options={GRANS} onChange={(v) => setG(v)} />
          {g !== "all" && (
            <div className="flex flex-wrap items-center gap-1">
              <IconBtn label="Período anterior" disabled={!canPrev} onClick={() => setAnchor(shiftPeriod(start, g, -1))}>
                ‹
              </IconBtn>
              <span className="min-w-[6.5rem] text-center sm:min-w-[10rem] text-sm font-medium text-ink">{periodLabel(start, g)}</span>
              <IconBtn label="Próximo período" disabled={!canNext} onClick={() => setAnchor(shiftPeriod(start, g, 1))}>
                ›
              </IconBtn>
              <input
                type="date"
                aria-label="Ir para data"
                className="ml-1 rounded-md border border-line bg-card px-2 py-1 text-sm text-ink"
                min={toInput(firstT)}
                max={toInput(lastT)}
                value={toInput(start.getTime())}
                onChange={(e) => e.target.value && setAnchor(new Date(`${e.target.value}T12:00:00`))}
              />
            </div>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ArtistPicker ds={ds} value={filters.artist} onChange={(a) => setFilters((f) => ({ ...f, artist: a }))} />
            <select
              aria-label="Filtrar por gênero"
              className="rounded-md border border-line bg-card px-2 py-1 text-sm text-ink"
              value={filters.genre ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, genre: e.target.value === "" ? null : Number(e.target.value) }))}
            >
              <option value="">Todos os gêneros</option>
              {ds.genres
                .map((name, i) => ({ name, i }))
                .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                .map(({ name, i }) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
            </select>
            <Segmented
              value={metric}
              options={[
                ["ms", "Tempo"],
                ["streams", "Reproduções"],
              ]}
              onChange={setMetric}
            />
          </div>
        </div>
        {(filters.artist !== null || filters.genre !== null) && (
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {filters.artist !== null && (
              <Chip onClear={() => setFilters((f) => ({ ...f, artist: null }))}>Artista: {ds.artistName[filters.artist]}</Chip>
            )}
            {filters.genre !== null && (
              <Chip onClear={() => setFilters((f) => ({ ...f, genre: null }))}>Gênero: {ds.genres[filters.genre]}</Chip>
            )}
          </div>
        )}
      </div>

      {filters.artist !== null && <ArtistCard ds={ds} artist={filters.artist} />}

      {/* Stat tiles */}
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Tempo ouvido" value={fmtDuration(tot.ms)} cur={tot.ms} prev={prevTot?.ms} hint={tot.days ? `${fmtDuration(tot.ms / tot.days)} por dia ativo` : undefined} />
        <Stat label="Reproduções (30 s+)" value={fmtInt(tot.streams)} cur={tot.streams} prev={prevTot?.streams} hint={`${fmtInt(tot.plays)} no total`} />
        <Stat label="Músicas diferentes" value={fmtInt(tot.tracks)} cur={tot.tracks} prev={prevTot?.tracks} hint={`${fmtInt(cur.newTracks)} ouvidas pela 1ª vez`} />
        <Stat label="Artistas diferentes" value={fmtInt(tot.artists)} cur={tot.artists} prev={prevTot?.artists} hint={`${fmtInt(cur.discoveries.length)} descobertos`} />
        <Stat label="Taxa de pulos" value={tot.plays ? fmtPct(tot.skips / tot.plays) : "—"} hint={tot.skips ? `pula após ${Math.round(cur.avgSkipSec)} s em média` : undefined} />
      </section>

      <Card title={timelineTitle(g, series.unit)} subtitle={g === "day" ? undefined : "Clique numa barra para ver em detalhe"}>
        <TimeChart buckets={series.buckets} metric={metric} onPick={g === "day" ? undefined : drill} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Artistas mais ouvidos" subtitle="Clique para filtrar">
          <BarList
            metric={metric}
            rows={sortBy(ranks.artist).map((r) => ({
              key: r.id,
              label: ds.artistName[r.id],
              sub: ds.genres[ds.artistGenre[r.id]],
              value: r[metric],
              onClick: () => pickArtist(r.id),
            }))}
          />
        </Card>
        <Card title="Músicas mais ouvidas">
          <BarList metric={metric} rows={sortBy(ranks.track).map((r) => trackRow(ds, r, metric, pickArtist))} />
        </Card>
        <Card title="Estilos musicais" subtitle="Clique para filtrar">
          <BarList
            metric={metric}
            rows={sortBy(ranks.genre).map((r) => ({
              key: r.id,
              label: ds.genres[r.id],
              value: r[metric],
              extra: fmtPct(r[metric] / (metric === "ms" ? tot.ms : tot.streams || 1)),
              onClick: () => pickGenre(r.id),
            }))}
          />
        </Card>
        <Card title="Álbuns mais ouvidos">
          <BarList
            metric={metric}
            rows={sortBy(ranks.album)
              .filter((r) => ds.albums[r.id])
              .map((r) => ({ key: r.id, label: ds.albums[r.id], sub: albumArtist(ds, r.id), value: r[metric] }))}
          />
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Quando você ouve" subtitle="Tempo por dia da semana e hora (horário local)">
          <Heatmap matrix={matrix} />
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-xl font-semibold text-ink">Curiosidades</h2>
      <Curiosities ds={ds} idx={idx} cur={cur} tot={tot} ranks={ranks} g={g} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LengthList ds={ds} idx={idx} longest />
        <LengthList ds={ds} idx={idx} longest={false} />
        <Card title="Mais puladas" subtitle="Mínimo de 5 tentativas · % de vezes que você pulou">
          <BarList
            metric="streams"
            rows={ranks.track
              .filter((r) => r.plays >= 5 && r.skips > 0)
              .sort((a, b) => b.skips / b.plays - a.skips / a.plays || b.skips - a.skips)
              .map((r) => ({
                key: r.id,
                label: ds.trackName[r.id],
                sub: ds.artistName[ds.trackArtist[r.id]],
                value: r.skips,
                extra: `${fmtPct(r.skips / r.plays)} de ${r.plays}`,
              }))}
          />
        </Card>
        <Card title="Nunca pula" subtitle="Mais ouvidas sem nenhum pulo no período">
          <BarList
            metric="streams"
            rows={ranks.track
              .filter((r) => r.skips === 0 && r.streams >= 3)
              .sort((a, b) => b.streams - a.streams)
              .map((r) => ({ key: r.id, label: ds.trackName[r.id], sub: ds.artistName[ds.trackArtist[r.id]], value: r.streams }))}
          />
        </Card>
        <Card title="Dispositivos">
          <BarList
            metric={metric}
            rows={sortBy(ranks.platform).map((r) => ({ key: r.id, label: ds.platforms[r.id], value: r[metric] }))}
          />
        </Card>
        <Card title="Artistas descobertos neste período" subtitle="Primeira vez que tocaram no seu histórico">
          <BarList
            metric="ms"
            rows={cur.discoveries.map((d) => ({
              key: d.artist,
              label: ds.artistName[d.artist],
              sub: `desde ${fmtDate(d.first)}`,
              value: d.ms,
              onClick: () => pickArtist(d.artist),
            }))}
          />
        </Card>
      </div>

      <footer className="mt-12 border-t border-line pt-4 text-xs text-muted">
        Durações das músicas são estimadas pela reprodução completa mais longa (o export do Spotify não traz a duração). Gêneros
        vêm das tags de artistas do MusicBrainz ({fmtInt(ds.genresCovered)} artistas consultados) e foram agrupados em estilos
        amplos. Uma “reprodução” conta quando você ouviu ao menos 30 s. Dados gerados em {fmtDateTime(Date.parse(ds.generatedAt))}.
      </footer>
    </Shell>
  );
}

// ---------- pieces ----------

function trackRow(ds: Dataset, r: RankRow, metric: Metric, pickArtist: (a: number) => void): BarRow {
  return {
    key: r.id,
    label: ds.trackName[r.id],
    sub: ds.artistName[ds.trackArtist[r.id]],
    value: r[metric],
    extra: metric === "ms" ? `${fmtInt(r.streams)}×` : undefined,
    onClick: () => pickArtist(ds.trackArtist[r.id]),
  };
}

function albumArtist(ds: Dataset, album: number) {
  const i = ds.trackAlbum.indexOf(album);
  return i >= 0 ? ds.artistName[ds.trackArtist[i]] : undefined;
}

function timelineTitle(g: Granularity, unit: string) {
  const per: Record<string, string> = { hour: "por hora", day: "por dia", week: "por semana", month: "por mês" };
  return `Tempo ouvido ${per[unit]}${g === "all" ? "" : ""}`;
}

const toInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <h3 className="font-semibold text-ink">{title}</h3>
      {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, cur, prev, hint }: { label: string; value: string; cur?: number; prev?: number; hint?: string }) {
  let delta: ReactNode = null;
  if (cur !== undefined && prev !== undefined && prev > 0) {
    const d = (cur - prev) / prev;
    delta = (
      <span className="text-xs text-ink-2">
        {d >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(d))} vs anterior
      </span>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {delta}
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full border border-line bg-card p-0.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${value === v ? "bg-accent font-semibold text-on-accent" : "text-ink-2 hover:text-ink"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-8 w-8 rounded-md border border-line bg-card text-lg leading-none text-ink disabled:opacity-30 enabled:hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

function Chip({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-card py-0.5 pl-3 pr-1 text-ink">
      {children}
      <button type="button" aria-label="Remover filtro" onClick={onClear} className="rounded-full px-1.5 text-muted hover:bg-surface-2 hover:text-ink">
        ×
      </button>
    </span>
  );
}

function ArtistPicker({ ds, value, onChange }: { ds: Dataset; value: number | null; onChange: (a: number | null) => void }) {
  const [text, setText] = useState("");
  const byName = useMemo(() => new Map(ds.artistName.map((n, i) => [n.toLowerCase(), i])), [ds]);
  const sorted = useMemo(() => [...ds.artistName].sort((a, b) => a.localeCompare(b, "pt-BR")), [ds]);
  // Sync the text box when the filter changes from elsewhere (e.g. clicking a row).
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setText(value === null ? "" : ds.artistName[value]);
  }
  return (
    <>
      <input
        list="artist-list"
        placeholder="Buscar artista…"
        aria-label="Filtrar por artista"
        className="w-44 rounded-md border border-line bg-card px-2 py-1 text-sm text-ink placeholder:text-muted"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const hit = byName.get(e.target.value.toLowerCase());
          if (hit !== undefined) onChange(hit);
          else if (!e.target.value) onChange(null);
        }}
      />
      <datalist id="artist-list">
        {sorted.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </>
  );
}

function ArtistCard({ ds, artist }: { ds: Dataset; artist: number }) {
  const info = useMemo(() => {
    const all = rank(ds, select(ds, { from: -Infinity, to: Infinity }, { artist: null, genre: null }), "artist").sort((a, b) => b.ms - a.ms);
    const pos = all.findIndex((r) => r.id === artist);
    let last = 0;
    for (let i = ds.n - 1; i >= 0; i--)
      if (ds.trackArtist[ds.k[i]] === artist) {
        last = ds.t[i];
        break;
      }
    return { row: all[pos], pos: pos + 1, last };
  }, [ds, artist]);
  const tags = ds.artistTags[artist];
  return (
    <section className="mb-6 rounded-xl border border-line bg-card p-5">
      <div className="text-xs text-muted">Artista selecionado</div>
      <h2 className="text-2xl font-semibold text-ink">{ds.artistName[artist]}</h2>
      <p className="text-sm text-ink-2">
        {ds.genres[ds.artistGenre[artist]]}
        {tags.length ? ` · tags: ${tags.join(", ")}` : ""}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Fact k="Posição de todos os tempos" v={`#${info.pos}`} />
        <Fact k="Total de todos os tempos" v={fmtDuration(info.row?.ms ?? 0)} />
        <Fact k="Primeira vez" v={fmtDate(ds.artistFirst[artist])} />
        <Fact k="Última vez" v={fmtDate(info.last)} />
      </div>
    </section>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{k}</div>
      <div className="font-medium text-ink">{v}</div>
    </div>
  );
}

function Curiosities({
  ds,
  idx,
  cur,
  tot,
  ranks,
  g,
}: {
  ds: Dataset;
  idx: Int32Array;
  cur: ReturnType<typeof curiosities>;
  tot: Totals;
  ranks: Record<"artist" | "track", RankRow[]>;
  g: Granularity;
}) {
  if (!idx.length) return <p className="text-ink-2">Nada ouvido neste período.</p>;
  const s = cur.longestSession;
  const topTrack = [...ranks.track].sort((a, b) => b.streams - a.streams)[0];
  const items: { k: string; v: string; d?: string }[] = [];
  if (s)
    items.push({
      k: "Maior sessão sem parar",
      v: fmtDuration(s.end - s.start),
      d: `${fmtDateTime(s.start)} · ${fmtInt(s.plays)} músicas`,
    });
  if (cur.busiestDay && g !== "day")
    items.push({ k: "Dia mais intenso", v: fmtDuration(cur.busiestDay.ms), d: cap(fmtDate(cur.busiestDay.day)) });
  if (cur.streak && cur.streak.days > 1 && g !== "day")
    items.push({ k: "Dias seguidos ouvindo", v: `${fmtInt(cur.streak.days)} dias`, d: `${fmtDate(cur.streak.from)} – ${fmtDate(cur.streak.to)}` });
  if (cur.repeat)
    items.push({
      k: "Modo repeat",
      v: `${cur.repeat.count}× no mesmo dia`,
      d: `${ds.trackName[cur.repeat.track]} — ${ds.artistName[ds.trackArtist[cur.repeat.track]]}, ${fmtDate(cur.repeat.day)}`,
    });
  if (topTrack)
    items.push({
      k: "Música do período",
      v: ds.trackName[topTrack.id],
      d: `${ds.artistName[ds.trackArtist[topTrack.id]]} · ${fmtInt(topTrack.streams)} reproduções`,
    });
  if (cur.favoriteHour !== null)
    items.push({
      k: "Horário favorito",
      v: `${cur.favoriteHour}h – ${cur.favoriteHour + 1}h`,
      d: cur.favoriteWeekday !== null && g !== "day" ? `Dia da semana favorito: ${WEEKDAYS[cur.favoriteWeekday].toLowerCase()}` : undefined,
    });
  items.push({ k: "Coruja da madrugada", v: fmtPct(cur.nightShare), d: "do tempo ouvido entre 0h e 5h" });
  items.push({ k: "No aleatório", v: fmtPct(cur.shuffleShare), d: `offline: ${fmtPct(cur.offlineShare)}` });
  if (tot.streams)
    items.push({
      k: "Fidelidade",
      v: `${(tot.streams / Math.max(1, tot.tracks)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×`,
      d: "reproduções por música diferente",
    });
  if (cur.firstPlay !== null && g !== "all")
    items.push({
      k: "Primeira música do período",
      v: ds.trackName[ds.k[cur.firstPlay]],
      d: `${ds.artistName[ds.trackArtist[ds.k[cur.firstPlay]]]} · ${fmtDateTime(ds.t[cur.firstPlay] - ds.ms[cur.firstPlay])}`,
    });
  if (cur.firstPlay !== null && g === "all")
    items.push({
      k: "A primeira de todas",
      v: ds.trackName[ds.k[cur.firstPlay]],
      d: `${ds.artistName[ds.trackArtist[ds.k[cur.firstPlay]]]} · ${fmtDateTime(ds.t[cur.firstPlay] - ds.ms[cur.firstPlay])}`,
    });
  items.push({
    k: "Equivale a",
    v: `${(tot.ms / 86_400_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`,
    d: `ou ${fmtInt(Math.round(tot.ms / (3.5 * 60_000)))} músicas de 3:30`,
  });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <div key={it.k} className="rounded-xl border border-line bg-card p-4">
          <div className="text-xs text-muted">{it.k}</div>
          <div className="mt-1 truncate text-lg font-semibold text-ink" title={it.v}>
            {it.v}
          </div>
          {it.d && <div className="mt-0.5 text-xs text-ink-2">{it.d}</div>}
        </div>
      ))}
    </div>
  );
}

function LengthList({ ds, idx, longest }: { ds: Dataset; idx: Int32Array; longest: boolean }) {
  const rows = useMemo(() => {
    const plays = new Map<number, number>();
    for (const i of idx) plays.set(ds.k[i], (plays.get(ds.k[i]) || 0) + 1);
    return [...plays.keys()]
      .filter((k) => ds.trackDur[k] >= 15_000)
      .sort((a, b) => (longest ? ds.trackDur[b] - ds.trackDur[a] : ds.trackDur[a] - ds.trackDur[b]))
      .slice(0, 10)
      .map((k) => ({ k, dur: ds.trackDur[k], plays: plays.get(k)! }));
  }, [ds, idx, longest]);
  return (
    <Card title={longest ? "Músicas mais longas ouvidas" : "Músicas mais curtas ouvidas"} subtitle="Duração estimada (ouvidas até o fim ao menos uma vez)">
      {rows.length ? (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.k} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-2 px-1">
              <span className="text-right text-xs tabular-nums text-muted">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{ds.trackName[r.k]}</span>
                <span className="block truncate text-xs text-muted">{ds.artistName[ds.trackArtist[r.k]]}</span>
              </span>
              <span className="text-right text-sm tabular-nums text-ink">
                {fmtClock(r.dur)}
                <span className="block text-xs text-muted">{r.plays}× tocada</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-6 text-center text-sm text-muted">Nenhuma música completa neste período.</p>
      )}
    </Card>
  );
}
