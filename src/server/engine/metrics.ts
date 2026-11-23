/**
 * Calculation Engine — satu sumber kebenaran untuk angka turunan.
 *
 * Aturan (prompt Fase 2 butir 3):
 *  - Uang selalu BigInt satuan terkecil (sen). Tidak ada float / Number / Math.round.
 *  - Fungsi murni: masukan eksplisit, keluaran deterministik, mudah diuji.
 *  - Pembagi nol / data kurang → `null` + `reason` ("N/A + alasan"), BUKAN nol.
 *  - Proyeksi selalu ditandai `projection: true` agar tidak tercampur aktual.
 *
 * Pemakai: route laporan/BI, shift kasir, ekspor, struk, dashboard.
 */

export type Metric = {
  cents: bigint | null;
  /** Alasan bila nilai tidak dapat dihitung. */
  reason?: string;
};

const ok = (cents: bigint): Metric => ({ cents });
const na = (reason: string): Metric => ({ cents: null, reason });

export const ZERO = 0n;

/* ───────────────────────── Penjualan & laba ───────────────────────── */

export type SalesBreakdown = {
  gross: bigint;
  /** Diskon yang diberikan penjual (bukan diskon platform). */
  sellerDiscounts?: bigint;
  returns?: bigint;
  /** Potongan lain yang disepakati (mis. kompensasi). */
  adjustments?: bigint;
};

/** Net Sales = penjualan kotor − diskon penjual − retur − potongan. */
export function netSales(b: SalesBreakdown): Metric {
  const value = b.gross - (b.sellerDiscounts ?? ZERO) - (b.returns ?? ZERO) - (b.adjustments ?? ZERO);
  if (value < ZERO) return na("net_sales_negative");
  return ok(value);
}

/** Gross Profit = Net Sales − COGS. */
export function grossProfit(net: Metric, cogs: bigint): Metric {
  if (net.cents === null) return na(net.reason ?? "net_sales_unavailable");
  return ok(net.cents - cogs);
}

/** Margin dalam basis point (1 bp = 0,01%). Hanya bila penyebut > 0. */
export function marginBp(numerator: Metric, denominator: Metric): Metric {
  if (numerator.cents === null) return na(numerator.reason ?? "numerator_unavailable");
  if (denominator.cents === null) return na(denominator.reason ?? "denominator_unavailable");
  if (denominator.cents <= ZERO) return na("zero_revenue");
  return ok((numerator.cents * 10_000n) / denominator.cents);
}

/** Net Profit hanya bila klasifikasi akun lengkap (pemanggil menentukan). */
export function netProfit(p: { grossProfit: Metric; operatingExpense: bigint; classificationComplete: boolean }): Metric {
  if (!p.classificationComplete) return na("classification_incomplete");
  if (p.grossProfit.cents === null) return na(p.grossProfit.reason ?? "gross_profit_unavailable");
  return ok(p.grossProfit.cents - p.operatingExpense);
}

/* ───────────────────────── Kas & shift ───────────────────────── */

/** Expected Cash = modal awal + kas masuk − kas keluar (termasuk refund tunai). */
export function expectedCash(input: {
  openingFloat: bigint;
  cashSales: bigint;
  cashIn: bigint;
  cashOut: bigint;
  cashRefunds?: bigint;
}): Metric {
  return ok(input.openingFloat + input.cashSales + input.cashIn - input.cashOut - (input.cashRefunds ?? ZERO));
}

/** Cash Variance = kas dihitung − Expected Cash. */
export function cashVariance(countedCash: bigint, expected: Metric): Metric {
  if (expected.cents === null) return na(expected.reason ?? "expected_cash_unavailable");
  return ok(countedCash - expected.cents);
}

/* ───────────────────────── Marketplace ───────────────────────── */

/**
 * Estimasi settlement = bruto layak − diskon penjual − fee/komisi − retur/refund
 * − ongkir/subsidi ± baris laporan platform.
 * Fee yang tidak diketahui → N/A ("fee_unknown"), bukan nol.
 */
export function expectedSettlement(input: {
  grossEligible: bigint;
  sellerDiscounts?: bigint;
  /** null/undefined = belum diketahui. */
  fees?: bigint | null;
  refunds?: bigint;
  shipping?: bigint;
  reportAdjustment?: bigint;
}): Metric {
  if (input.fees === null || input.fees === undefined) return na("fee_unknown");
  return ok(
    input.grossEligible -
      (input.sellerDiscounts ?? ZERO) -
      input.fees -
      (input.refunds ?? ZERO) -
      (input.shipping ?? ZERO) +
      (input.reportAdjustment ?? ZERO),
  );
}

/** Net Channel Contribution = Net Sales kanal − COGS − biaya variabel kanal terverifikasi. */
export function netChannelContribution(input: {
  channelNetSales: Metric;
  cogs: bigint;
  verifiedVariableCosts: bigint;
}): Metric {
  if (input.channelNetSales.cents === null) return na(input.channelNetSales.reason ?? "net_sales_unavailable");
  return ok(input.channelNetSales.cents - input.cogs - input.verifiedVariableCosts);
}

/* ───────────────────────── Pribadi, anggaran, proyeksi ───────────────────────── */

/** Personal Net Worth = aset tercatat − kewajiban tercatat. */
export function personalNetWorth(input: { assets: bigint; liabilities: bigint }): Metric {
  return ok(input.assets - input.liabilities);
}

/** Budget Variance = aktual terposting − anggaran disetujui. */
export function budgetVariance(input: { actual: bigint; approvedBudget: bigint }): Metric {
  return ok(input.actual - input.approvedBudget);
}

/**
 * Forecast Kas = saldo buku awal + penerimaan proyeksi − pengeluaran proyeksi.
 * Selalu `projection: true`; nilainya tidak boleh dicampur dengan aktual di UI.
 */
export function forecastCash(input: { openingBook: bigint; projectedIn: bigint; projectedOut: bigint }) {
  return {
    cents: input.openingBook + input.projectedIn - input.projectedOut,
    projection: true as const,
    label: "PROYEKSI",
  };
}

/* ───────────────────────── Aset tetap ───────────────────────── */

/**
 * Penyusutan garis lurus = (perolehan − residu) / umur manfaat.
 * Periode terakhir menutup sisa pembulatan dan tidak pernah melampaui nilai buku
 * atau turun di bawah nilai residu.
 */
export function straightLineDepreciation(input: {
  acquisition: bigint;
  residual: bigint;
  usefulLifeMonths: number;
  /** Berapa bulan (termasuk periode ini) sudah disusutkan. */
  monthsElapsed: number;
  accumulated: bigint;
  bookValue: bigint;
  periodIndex?: number;
}): Metric {
  if (input.usefulLifeMonths <= 0) return na("useful_life_missing");
  if (input.acquisition < ZERO || input.residual < ZERO) return na("invalid_acquisition");
  if (input.residual > input.acquisition) return na("residual_exceeds_cost");

  const depreciable = input.acquisition - input.residual;
  const remaining = depreciable - input.accumulated;
  if (remaining <= ZERO) return ok(ZERO);

  const index = input.periodIndex ?? input.monthsElapsed;
  if (index >= input.usefulLifeMonths) return ok(remaining); // periode terakhir menutup sisa

  let amount = depreciable / BigInt(input.usefulLifeMonths);
  // Bulan terakhir: tutup sisa pembulatan agar total tepat.
  if (index + 1 === input.usefulLifeMonths) amount = remaining;
  if (amount > remaining) amount = remaining;

  const maxByBook = input.bookValue - input.residual;
  if (maxByBook <= ZERO) return ok(ZERO);
  if (amount > maxByBook) amount = maxByBook;
  return ok(amount);
}

/* ───────────────────────── Booking ───────────────────────── */

/** Booking outstanding = nilai booking − deposit teralokasi − pembayaran sah lain. */
export function bookingOutstanding(input: {
  bookingValue: bigint;
  allocatedDeposits: bigint;
  otherValidPayments?: bigint;
}): Metric {
  const paid = input.allocatedDeposits + (input.otherValidPayments ?? ZERO);
  const value = input.bookingValue - paid;
  if (value < ZERO) return na("overpaid");
  return ok(value);
}

/* ───────────────────────── Pembantu tampilan ───────────────────────── */

/** "N/A — alasan" untuk UI; tidak pernah mengembalikan angka palsu. */
export function formatMetric(m: Metric, render: (cents: bigint) => string): string {
  if (m.cents === null) return `N/A — ${m.reason ?? "tidak tersedia"}`;
  return render(m.cents);
}

/** Persen dari basis point, hanya untuk tampilan (bukan perhitungan uang). */
export function bpToPercent(bp: Metric): string {
  if (bp.cents === null) return `N/A — ${bp.reason ?? "tidak tersedia"}`;
  const whole = bp.cents / 100n;
  const frac = (bp.cents % 100n + 100n) % 100n;
  return `${whole}.${frac.toString().padStart(2, "0")}%`;
}
