/**
 * Perhitungan diskon voucher — murni, deterministik, tanpa float (R11-E).
 *
 * Voucher di aplikasi ini adalah **catatan diskon** pada penjualan yang dicatat,
 * bukan alat pembayaran: tidak ada uang berpindah, tidak ada penyambungan pihak ketiga.
 *
 * Satuan: unit minor (bigint). `percentBp` = basis poin (1250 = 12,50%).
 */
export type VoucherRule = {
  kind: "percent" | "amount";
  percentBp: number | null;
  amountMinor: bigint | null;
  minPurchaseMinor: bigint;
  maxDiscountMinor: bigint | null;
};

export type VoucherOutcome =
  | { ok: true; discountMinor: bigint }
  | { ok: false; reason: "below_minimum" | "zero_after_rules" | "invalid_rule" };

/** Diskon = min(nilai voucher, batas maksimum, nilai belanja). */
export function computeVoucherDiscount(rule: VoucherRule, amountMinor: bigint): VoucherOutcome {
  if (amountMinor <= 0n) return { ok: false, reason: "below_minimum" };
  if (amountMinor < rule.minPurchaseMinor) return { ok: false, reason: "below_minimum" };

  let discount: bigint;
  if (rule.kind === "percent") {
    if (rule.percentBp === null || rule.percentBp <= 0) return { ok: false, reason: "invalid_rule" };
    // Pembulatan ke bawah ke unit minor terkecil; tidak pernah melebihi nilai belanja.
    discount = (amountMinor * BigInt(rule.percentBp)) / 10_000n;
  } else {
    if (rule.amountMinor === null || rule.amountMinor <= 0n) return { ok: false, reason: "invalid_rule" };
    discount = rule.amountMinor;
  }

  if (rule.maxDiscountMinor !== null && discount > rule.maxDiscountMinor) discount = rule.maxDiscountMinor;
  if (discount > amountMinor) discount = amountMinor;
  if (discount <= 0n) return { ok: false, reason: "zero_after_rules" };
  return { ok: true, discountMinor: discount };
}

/** Apakah voucher masih dapat dipakai pada tanggal & kuota tertentu. */
export function voucherUsable(
  voucher: { isActive: boolean; validFrom: string; validTo: string; quota: number | null; used: number },
  onDate: string,
): boolean {
  if (!voucher.isActive) return false;
  if (onDate < voucher.validFrom || onDate > voucher.validTo) return false;
  if (voucher.quota !== null && voucher.used >= voucher.quota) return false;
  return true;
}
