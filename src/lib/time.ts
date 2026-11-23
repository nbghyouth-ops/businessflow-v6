/**
 * Tanggal lokal (bukan UTC) untuk batas hari/bulan pada laporan dan transaksi.
 * Murni & dapat diuji: masukan waktu eksplisit, keluaran deterministik.
 */
export function dateInTz(timeZone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** Awal & akhir bulan (YYYY-MM) pada zona waktu tertentu, sebagai YYYY-MM-DD. */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error("month harus YYYY-MM");
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

/** Rentang tanggal default bila pengguna tidak memilih: bulan berjalan pada zona bisnis. */
export function currentMonthRange(timeZone: string, at: Date = new Date()): { from: string; to: string } {
  const today = dateInTz(timeZone, at);
  const { start } = monthBounds(today.slice(0, 7));
  return { from: start, to: today };
}
