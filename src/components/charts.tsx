"use client";
import { tr } from "@/lib/tr";
import { useId } from "react";
import { formatMoney } from "@/lib/money";

type Point = { label: string; a: number; b: number };

/** Grafik batang pill ganda v4.1: Pemasukan = hitam var(--color-action), Pengeluaran = periwinkle lembut var(--color-accent-soft) (D1 §3.4). */
export function DualBarChart({
  data,
  aLabel,
  bLabel,
  currency,
  summary,
}: {
  data: Point[];
  aLabel: string;
  bLabel: string;
  currency: string;
  summary: string;
}) {
  const pid = useId().replace(/:/g, "");
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const W = 680;
  const H = 228;
  const padX = 24;
  const padY = 28;
  const plotH = H - padY * 2;
  const step = (W - padX * 2) / Math.max(1, data.length);
  const bw = Math.max(6, Math.min(18, step * 0.34));
  const rx = bw / 2;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full">
        <defs>
          <pattern id={`hatch-${pid}`} width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="var(--color-surface-2)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-line)" strokeWidth="2" />
          </pattern>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={W - padX}
            y1={H - padY - t * plotH}
            y2={H - padY - t * plotH}
            stroke="var(--color-surface-3)"
          />
        ))}
        {data.map((d, i) => {
          const x = padX + i * step + step / 2;
          const ha = d.a > 0 ? Math.max(12, (d.a / max) * plotH) : plotH * 0.55;
          const hb = d.b > 0 ? Math.max(12, (d.b / max) * plotH) : plotH * 0.42;
          return (
            <g key={d.label}>
              <title>{`${d.label}: ${aLabel} ${formatMoney(d.a, currency)}, ${bLabel} ${formatMoney(d.b, currency)}`}</title>
              <rect
                x={x - bw - 2}
                y={H - padY - ha}
                width={bw}
                height={ha}
                rx={rx}
                fill={d.a > 0 ? "var(--color-action)" : `url(#hatch-${pid})`}
              />
              <rect
                x={x + 2}
                y={H - padY - hb}
                width={bw}
                height={hb}
                rx={rx}
                fill={d.b > 0 ? "var(--color-accent-soft)" : `url(#hatch-${pid})`}
              />
              {(data.length <= 12 || i % Math.ceil(data.length / 8) === 0) && (
                <text x={x} y={H - 8} textAnchor="middle" fontSize="10" fontWeight="500" fill="var(--color-muted)">
                  {d.label.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-[var(--color-action)]" />
          {aLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent-soft)]" />
          {bLabel}
        </span>
        <span>{tr("Sumber: jurnal akuntansi (posted)")}</span>
      </figcaption>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-ink underline">{tr("Lihat sebagai tabel")}</summary>
        <div className="table-wrap mt-2 max-h-64 overflow-y-auto">
          <table>
            <thead>
              <tr>
                <th>{tr("Tanggal")}</th>
                <th className="r">{aLabel}</th>
                <th className="r">{bLabel}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <td>{d.label}</td>
                  <td className="r">{formatMoney(d.a, currency)}</td>
                  <td className="r">{formatMoney(d.b, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Grafik area spline halus untuk kartu tren sekunder di Dashboard. */
export function SplineAreaChart({
  data,
  aLabel,
  bLabel,
  currency,
  summary,
}: {
  data: Point[];
  aLabel: string;
  bLabel: string;
  currency: string;
  summary: string;
}) {
  const pid = useId().replace(/:/g, "");
  if (!data.length) return null;
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const W = 380;
  const H = 160;
  const padX = 14;
  const padY = 18;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  const toPoints = (vals: number[]) =>
    vals.map((v, i) => ({
      x: padX + (vals.length === 1 ? plotW / 2 : (i / (vals.length - 1)) * plotW),
      y: H - padY - (v / max) * plotH,
    }));

  const buildSmooth = (pts: { x: number; y: number }[]) => {
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const ptsA = toPoints(data.map((d) => d.a));
  const ptsB = toPoints(data.map((d) => d.b));
  const lineA = buildSmooth(ptsA);
  const lineB = buildSmooth(ptsB);
  const areaA = `${lineA} L ${ptsA[ptsA.length - 1].x} ${H - padY} L ${ptsA[0].x} ${H - padY} Z`;

  return (
    <figure>
      <div className="mb-2 flex items-center gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-[var(--color-action)]" />
          {aLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-[var(--color-gold)]" />
          {bLabel}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full">
        <defs>
          <linearGradient id={`grad-${pid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-action)" stopOpacity="0.1" />
            <stop offset="100%" stopColor="var(--color-action)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaA} fill={`url(#grad-${pid})`} />
        <path d={lineB} fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeLinecap="round" />
        <path d={lineA} fill="none" stroke="var(--color-action)" strokeWidth="2.5" strokeLinecap="round" />
        {ptsA.length > 0 && (
          <circle
            cx={ptsA[ptsA.length - 1].x}
            cy={ptsA[ptsA.length - 1].y}
            r="4"
            fill="var(--color-white)"
            stroke="var(--color-action)"
            strokeWidth="2.5"
          />
        )}
      </svg>
      <p className="mt-1 text-[11px] text-ink-2">
        Puncak periode: {formatMoney(Math.max(...data.map((d) => d.a)), currency)}
      </p>
    </figure>
  );
}
