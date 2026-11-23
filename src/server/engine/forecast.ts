/**
 * Calculation Engine v6 — forecast arus kas.
 *
 * Aturan:
 *  - Semua aritmetika uang memakai BigInt sen (tidak ada floating point).
 *  - Fungsi di berkas ini murni: masukan eksplisit, keluaran deterministik.
 *  - Tidak mengarang data: bila tidak ada riwayat, hasilnya nol dan `confidence` rendah.
 */
import { fromCents, toCents } from "@/lib/money";

export type ForecastEvent = { date: string; amount: string; label: string };
export type ForecastInput = {
  openingBalance: string;
  inflows: ForecastEvent[];
  outflows: ForecastEvent[];
  /** Rata-rata beban operasional harian dari riwayat (sudah dihitung pemanggil). */
  dailyOperatingExpense: string;
  weeks: number;
  /** Tanggal mulai (YYYY-MM-DD). */
  startDate: string;
  /** Jumlah faktur/tagihan yang menjadi dasar proyeksi. */
  evidenceCount: number;
};

export type ForecastWeek = {
  week: number;
  start: string;
  end: string;
  opening: string;
  inflow: string;
  outflow: string;
  operating: string;
  closing: string;
  /** true bila saldo akhir pekan negatif. */
  shortfall: boolean;
};

export type ForecastResult = {
  weeks: ForecastWeek[];
  minClosing: string;
  minWeek: number | null;
  totalInflow: string;
  totalOutflow: string;
  runwayWeeks: number | null;
  confidence: "low" | "medium" | "high";
};

/** Uang bertanda (DB dapat mengembalikan saldo negatif) — tetap BigInt, tanpa floating point. */
function centsOf(value: string | number | null | undefined): bigint {
  const raw = String(value ?? "0").trim();
  if (!raw) return 0n;
  const negative = raw.startsWith("-");
  const abs = negative ? raw.slice(1) : raw;
  try {
    const v = toCents(abs || "0");
    return negative ? -v : v;
  } catch {
    return 0n;
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const x = Date.parse(a + "T00:00:00Z");
  const y = Date.parse(b + "T00:00:00Z");
  return Math.round((y - x) / 86_400_000);
}

export function buildForecast(input: ForecastInput): ForecastResult {
  const weeks = Math.max(1, Math.min(52, Math.floor(input.weeks)));
  const start = /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : new Date().toISOString().slice(0, 10);
  const daily = centsOf(input.dailyOperatingExpense);

  // Bucket per minggu (7 hari) berdasarkan selisih hari dari tanggal mulai.
  const inflowBuckets = Array.from({ length: weeks }, () => 0n);
  const outflowBuckets = Array.from({ length: weeks }, () => 0n);
  for (const e of input.inflows) {
    const idx = Math.floor(daysBetween(start, e.date) / 7);
    if (idx >= 0 && idx < weeks) inflowBuckets[idx] += centsOf(e.amount);
  }
  for (const e of input.outflows) {
    const idx = Math.floor(daysBetween(start, e.date) / 7);
    if (idx >= 0 && idx < weeks) outflowBuckets[idx] += centsOf(e.amount);
  }

  let balance = centsOf(input.openingBalance);
  const rows: ForecastWeek[] = [];
  let minClosing = balance;
  let minWeek: number | null = null;
  let totalIn = 0n;
  let totalOut = 0n;
  let runway: number | null = null;

  for (let i = 0; i < weeks; i++) {
    const opening = balance;
    const inflow = inflowBuckets[i];
    const outflow = outflowBuckets[i];
    const operating = daily * 7n;
    balance = opening + inflow - outflow - operating;
    totalIn += inflow;
    totalOut += outflow + operating;
    rows.push({
      week: i + 1,
      start: addDays(start, i * 7),
      end: addDays(start, i * 7 + 6),
      opening: fromCents(opening),
      inflow: fromCents(inflow),
      outflow: fromCents(outflow),
      operating: fromCents(operating),
      closing: fromCents(balance),
      shortfall: balance < 0n,
    });
    if (balance < minClosing) {
      minClosing = balance;
      minWeek = i + 1;
    }
    if (runway === null && balance < 0n) runway = i + 1;
  }

  const confidence = input.evidenceCount >= 12 ? "high" : input.evidenceCount >= 4 ? "medium" : "low";
  return {
    weeks: rows,
    minClosing: fromCents(minClosing),
    minWeek,
    totalInflow: fromCents(totalIn),
    totalOutflow: fromCents(totalOut),
    runwayWeeks: runway,
    confidence,
  };
}

/** Klasifikasi kesehatan kas sederhana untuk BI. */
export function cashHealth(minClosing: string, weeks: number): "healthy" | "tight" | "at_risk" {
  const v = centsOf(minClosing);
  if (v < 0n) return "at_risk";
  if (v === 0n) return weeks > 8 ? "tight" : "healthy";
  return "healthy";
}
