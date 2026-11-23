/**
 * Instrumentasi kelambatan event loop server (R15 §2.1).
 *
 * Histogram diaktifkan sekali per proses; `/api/v1/health` menyertakannya sehingga
 * uji beban bisa membuktikan pekerjaan impor tidak menahan event loop. Angka ini
 * diukur pada PostgreSQL LOKAL (bukan klaim produksi).
 */
import { monitorEventLoopDelay } from "node:perf_hooks";

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

const ms = (ns: number) => Math.round((ns / 1e6) * 100) / 100;

export type EventLoopDelay = { samples: number; p50Ms: number; p99Ms: number; maxMs: number };

export function eventLoopDelaySnapshot(): EventLoopDelay {
  return {
    samples: histogram.count,
    p50Ms: ms(histogram.percentile(50)),
    p99Ms: ms(histogram.percentile(99)),
    maxMs: ms(histogram.max),
  };
}

/** Mulai jendela pengukuran baru (dipakai uji beban sebelum skenario dimulai). */
export function resetEventLoopDelay(): void {
  histogram.reset();
}
