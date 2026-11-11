"use client";

import { useState, type ReactNode } from "react";
import { WEEKDAYS, fmtDuration, fmtInt, type Bucket } from "@/lib/history";

export type Metric = "ms" | "streams";

export const fmtMetric = (v: number, m: Metric) => (m === "ms" ? fmtDuration(v) : `${fmtInt(v)} reprod.`);

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function axisLabel(v: number, m: Metric) {
  if (m === "streams") return fmtInt(v);
  const h = v / 3_600_000;
  if (h >= 1) return `${fmtInt(Math.round(h * 10) / 10)} h`;
  return `${Math.round(v / 60_000)} min`;
}

export function TimeChart({
  buckets,
  metric,
  onPick,
}: {
  buckets: Bucket[];
  metric: Metric;
  onPick?: (b: Bucket) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = buckets.map((b) => b[metric]);
  const max = niceMax(Math.max(0, ...values));
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(buckets.length / 8);
  const h = hover !== null ? buckets[hover] : null;

  if (!buckets.length) return <Empty />;

  return (
    <div className="relative">
      <div className="flex">
        {/* y axis */}
        <div className="relative w-14 shrink-0 text-right text-xs text-muted" style={{ height: 220 }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
              {axisLabel(t, metric)}
            </span>
          ))}
        </div>
        <div className="relative flex-1 min-w-0">
          {/* gridlines */}
          <div className="absolute inset-x-0 top-0" style={{ height: 220 }}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-line" style={{ top: `${100 - (t / max) * 100}%` }} />
            ))}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height: 220 }} onMouseLeave={() => setHover(null)}>
            {buckets.map((b, i) => (
              <button
                key={b.start.getTime()}
                type="button"
                aria-label={`${b.label}: ${fmtMetric(b[metric], metric)}`}
                className={`group flex h-full min-w-0 flex-1 items-end justify-center ${onPick ? "cursor-pointer" : "cursor-default"}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => onPick?.(b)}
              >
                <span
                  className={`block w-full max-w-6 rounded-t-[4px] transition-colors ${hover === i ? "bg-accent-strong" : "bg-accent"}`}
                  style={{ height: `${(b[metric] / max) * 100}%`, minHeight: b[metric] > 0 ? 2 : 0 }}
                />
              </button>
            ))}
          </div>
          <div className="relative mt-1 h-4 text-[11px] text-muted">
            {buckets.map((b, i) =>
              i % labelEvery === 0 ? (
                <span
                  key={b.start.getTime()}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${((i + 0.5) / buckets.length) * 100}%` }}
                >
                  {b.short}
                </span>
              ) : null,
            )}
          </div>
          {h && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-card px-3 py-2 text-sm shadow-lg"
              style={{
                left: `${((hover + 0.5) / buckets.length) * 100}%`,
                transform: `translateX(${hover / buckets.length > 0.6 ? "-105%" : "5%"})`,
              }}
            >
              <div className="font-medium text-ink">{h.label}</div>
              <div className="text-ink-2">{fmtDuration(h.ms)} · {fmtInt(h.streams)} reproduções</div>
              {onPick && <div className="mt-1 text-xs text-muted">Clique para detalhar</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type BarRow = { key: string | number; label: ReactNode; sub?: ReactNode; value: number; extra?: ReactNode; onClick?: () => void };

export function BarList({ rows, metric, initial = 10 }: { rows: BarRow[]; metric: Metric; initial?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!rows.length) return <Empty />;
  const max = rows[0].value || 1;
  const shown = expanded ? rows.slice(0, 50) : rows.slice(0, initial);
  return (
    <div>
      <ol className="space-y-1">
        {shown.map((r, i) => (
          <li key={r.key}>
            <button
              type="button"
              disabled={!r.onClick}
              onClick={r.onClick}
              className="group grid w-full grid-cols-[1.75rem_1fr_auto] items-center gap-x-2 rounded-md px-1 py-1 text-left enabled:hover:bg-surface-2"
            >
              <span className="text-right text-xs tabular-nums text-muted">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{r.label}</span>
                {r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}
                <span className="mt-1 block h-1.5 rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} />
                </span>
              </span>
              <span className="text-right text-xs tabular-nums text-ink-2">
                {fmtMetric(r.value, metric)}
                {r.extra && <span className="block text-muted">{r.extra}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {rows.length > initial && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="mt-2 text-sm text-accent-text hover:underline">
          {expanded ? "Mostrar menos" : `Mostrar mais (${Math.min(50, rows.length)})`}
        </button>
      )}
    </div>
  );
}

export function Heatmap({ matrix }: { matrix: number[][] }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const max = Math.max(0, ...matrix.flat());
  if (!max) return <Empty />;
  const step = (v: number) => (v <= 0 ? 0 : Math.min(7, 1 + Math.floor((Math.sqrt(v / max)) * 7)));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[4.5rem_repeat(24,1fr)] gap-[2px]" onMouseLeave={() => setHover(null)}>
          {matrix.map((row, d) => (
            <div key={d} className="contents">
              <span className="pr-2 text-right text-xs leading-6 text-muted">{WEEKDAYS[d].slice(0, 3)}</span>
              {row.map((v, hIdx) => (
                <span
                  key={hIdx}
                  onMouseEnter={() => setHover([d, hIdx])}
                  className={`h-6 rounded-[3px] ${hover?.[0] === d && hover?.[1] === hIdx ? "ring-2 ring-ink" : ""}`}
                  style={{ background: `var(--seq-${step(v)})` }}
                  title={`${WEEKDAYS[d]}, ${hIdx}h: ${fmtDuration(v)}`}
                />
              ))}
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, hIdx) => (
            <span key={hIdx} className="text-center text-[10px] text-muted">
              {hIdx % 3 === 0 ? `${hIdx}h` : ""}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>
            {hover ? `${WEEKDAYS[hover[0]]}, ${hover[1]}h – ${hover[1] + 1}h: ${fmtDuration(matrix[hover[0]][hover[1]])}` : "Passe o mouse sobre uma célula"}
          </span>
          <span className="flex items-center gap-1">
            menos
            {[1, 2, 3, 4, 5, 6, 7].map((s) => (
              <span key={s} className="inline-block h-3 w-3 rounded-[2px]" style={{ background: `var(--seq-${s})` }} />
            ))}
            mais
          </span>
        </div>
      </div>
    </div>
  );
}

export function Empty() {
  return <p className="py-6 text-center text-sm text-muted">Nada ouvido neste período.</p>;
}
