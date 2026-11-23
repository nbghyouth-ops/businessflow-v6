/**
 * Penanda metrik dashboard (`data-metric-id`).
 *
 * Dipakai agar tiap angka/kartu punya identitas stabil untuk pengujian,
 * analitik, dan otomasi tanpa bergantung pada teks atau kelas CSS.
 */
export const METRIC_IDS = {
  balanceCard: "cash.total",
  accountCarousel: "cash.accounts",
  statChart: "flow.chart",
  forecastBadge: "forecast.cash",
} as const;

export type MetricId = (typeof METRIC_IDS)[keyof typeof METRIC_IDS];
export const METRIC_ID_LIST: MetricId[] = Object.values(METRIC_IDS);
