"use client";

import { useMemo, type ReactNode } from "react";
import { fmtDate, fmtInt, rank, select, timeline, type Dataset } from "@/lib/history";
import { ThemeToggle } from "./theme-toggle";

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0 drop-shadow-md">
      <defs>
        <linearGradient id="logo-bars" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#1db954" />
          <stop offset="1" stopColor="#5cf08f" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="#121212" />
      <circle cx="32" cy="32" r="23" fill="none" stroke="#1ed760" strokeOpacity=".22" strokeWidth="2" />
      <g fill="url(#logo-bars)">
        <rect x="15" y="30" width="5" height="14" rx="2.5" />
        <rect x="23.5" y="20" width="5" height="24" rx="2.5" />
        <rect x="32" y="25" width="5" height="19" rx="2.5" />
        <rect x="40.5" y="16" width="5" height="28" rx="2.5" />
      </g>
      <circle cx="48" cy="45" r="3" fill="#1ed760" />
    </svg>
  );
}

const UNKNOWN = "Sem gênero identificado";

export function Hero({ ds, who = "me", actions }: { ds: Dataset | null; who?: "me" | "you"; actions?: ReactNode }) {
  const info = useMemo(() => {
    if (!ds) return null;
    const all = select(ds, { from: -Infinity, to: Infinity }, { artist: null, genre: null });
    let ms = 0;
    let streams = 0;
    const years = new Map<number, number>();
    for (const i of all) {
      ms += ds.ms[i];
      if (ds.ms[i] >= 30_000) streams++;
      const y = new Date(ds.t[i]).getFullYear();
      years.set(y, (years.get(y) || 0) + ds.ms[i]);
    }
    const top = <T extends { ms: number }>(rows: T[]) => rows.sort((a, b) => b.ms - a.ms)[0];
    const artist = top(rank(ds, all, "artist"));
    const track = rank(ds, all, "track").sort((a, b) => b.streams - a.streams)[0];
    const known = rank(ds, all, "genre").filter((r) => ds.genres[r.id] !== UNKNOWN);
    // Only name a favorite style when we know the genre of a good chunk of the listening time.
    const knownMs = known.reduce((sum, r) => sum + r.ms, 0);
    const genre = knownMs >= ms * 0.3 ? top(known) : undefined;
    const bestYear = [...years.entries()].sort((a, b) => b[1] - a[1])[0];
    const months = timeline(ds, all, new Date(), "all").buckets.map((b) => b.ms);
    const spanYears = (ds.t[ds.n - 1] - ds.t[0]) / (365.25 * 86_400_000);
    return { ms, streams, artist, track, genre, bestYear, months, spanYears };
  }, [ds]);

  const maxMonth = info ? Math.max(...info.months) : 1;

  return (
    <header className="hero relative overflow-hidden text-white">
      {/* real data as texture: monthly listening over the whole history */}
      {info && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex h-40 items-end gap-[2px] px-4 opacity-[0.22] sm:px-6">
          {info.months.map((v, i) => (
            <span key={i} className="flex-1 rounded-t-[3px] bg-spotify" style={{ height: `${(v / maxMonth) * 100}%` }} />
          ))}
        </div>
      )}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-spotify/20 blur-3xl" />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-8 pt-6 sm:px-6 sm:pb-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-medium text-white/85">
            <Logo size={32} />
            <span>Histórico estendido</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="mt-8 flex flex-col gap-2 sm:mt-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-spotify">
            {info ? spanLabel(info.spanYears) : who === "you" ? "Do zip para os gráficos" : "Carregando…"}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">{who === "me" ? "Meu" : "Seu"} histórico no Spotify</h1>
          {ds ? (
            <p className="max-w-2xl text-base text-white/80 sm:text-lg">
              Tudo o que tocou de {fmtDate(ds.t[0])} a {fmtDate(ds.t[ds.n - 1])}, por dia, semana, mês ou ano. Dá para filtrar por
              artista e por estilo.
            </p>
          ) : (
            who === "you" && (
              <p className="max-w-2xl text-base text-white/80 sm:text-lg">
                Pegue o arquivo que o Spotify manda com tudo o que você já ouviu e veja quanto tempo passou com cada artista, a que horas
                você mais escuta, o que mais pula e por aí vai.
              </p>
            )
          )}
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>

        {ds && info && (
          <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Highlight k="Horas ouvidas" v={`${fmtInt(Math.round(info.ms / 3_600_000))} h`} d={daysNonStop(info.ms)} />
            <Highlight k="Reproduções" v={fmtInt(info.streams)} d={`${fmtInt(ds.trackName.length)} músicas · ${fmtInt(ds.artistName.length)} artistas`} />
            <Highlight k="Artista nº 1" v={ds.artistName[info.artist.id]} d={`${fmtInt(Math.round(info.artist.ms / 3_600_000))} h juntos`} />
            <Highlight
              k="Música nº 1"
              v={ds.trackName[info.track.id]}
              d={`${ds.artistName[ds.trackArtist[info.track.id]]} · ${fmtInt(info.track.streams)}×`}
            />
            {info.genre && (
              <Highlight
                k="Estilo favorito"
                v={ds.genres[info.genre.id]}
                d={`${Math.round((info.genre.ms / info.ms) * 100)}% do tempo`}
              />
            )}
            <Highlight k="Ano mais intenso" v={String(info.bestYear[0])} d={`${fmtInt(Math.round(info.bestYear[1] / 3_600_000))} h ouvidas`} />
            <Highlight k="Primeira música" v={ds.trackName[ds.k[0]]} d={`${ds.artistName[ds.trackArtist[ds.k[0]]]} · ${fmtDate(ds.t[0])}`} />
            <Highlight
              k="Mais recente"
              v={ds.trackName[ds.k[ds.n - 1]]}
              d={`${ds.artistName[ds.trackArtist[ds.k[ds.n - 1]]]} · ${fmtDate(ds.t[ds.n - 1])}`}
            />
          </dl>
        )}
      </div>
    </header>
  );
}

function daysNonStop(ms: number) {
  const d = Math.round(ms / 86_400_000);
  if (d < 1) return "menos de 1 dia sem parar";
  return `≈ ${fmtInt(d)} ${d === 1 ? "dia" : "dias"} sem parar`;
}

function spanLabel(years: number) {
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12));
    return `${months} ${months === 1 ? "mês" : "meses"} de música`;
  }
  return `${years.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos de música`;
}

function Highlight({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm transition-colors hover:bg-white/[0.12]">
      <dt className="text-xs font-medium text-white/70">{k}</dt>
      <dd className="mt-1 truncate text-xl font-semibold" title={v}>
        {v}
      </dd>
      <dd className="mt-0.5 truncate text-xs text-white/75" title={d}>
        {d}
      </dd>
    </div>
  );
}
