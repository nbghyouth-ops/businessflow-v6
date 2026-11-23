/**
 * Perhitungan payroll MURNI (tanpa DB) agar dapat diuji dengan vektor angka.
 * Semua angka dalam satuan terkecil (BigInt). Tidak ada tarif pajak/BPJS yang dikarang:
 * potongan di luar absensi hanya berasal dari input manual eksplisit pengguna dengan label.
 */
export type AbsencePolicy = { mode: "none" } | { mode: "per_working_day"; workingDays: number };

export type PayrollInput = {
  salaryCents: bigint;
  allowances: { label: string; amountCents: bigint }[];
  manualDeductions: { label: string; amountCents: bigint }[];
  absentDays: number;
  policy: AbsencePolicy;
};

export type PayrollResult = {
  baseSalaryCents: bigint;
  allowancesCents: bigint;
  grossCents: bigint;
  absentDays: number;
  absenceDeductionCents: bigint;
  manualDeductionsCents: bigint;
  deductionsCents: bigint;
  netCents: bigint;
  trace: string[];
};

export class PayrollError extends Error {}

export function calcPayroll(i: PayrollInput): PayrollResult {
  if (i.salaryCents < 0n) throw new PayrollError("Gaji pokok tidak boleh negatif.");
  const allowances = i.allowances.reduce((s, a) => s + a.amountCents, 0n);
  const manual = i.manualDeductions.reduce((s, a) => s + a.amountCents, 0n);
  const gross = i.salaryCents + allowances;
  let absence = 0n;
  const trace = [`gaji pokok = ${i.salaryCents}`, ...i.allowances.map((a) => `tunjangan ${a.label} = ${a.amountCents}`), `gaji kotor = ${gross}`];
  if (i.policy.mode === "per_working_day" && i.absentDays > 0) {
    const wd = BigInt(i.policy.workingDays);
    const days = BigInt(Math.min(i.absentDays, i.policy.workingDays));
    absence = (i.salaryCents * days) / wd; // dibulatkan ke bawah (satuan terkecil)
    trace.push(`potongan absensi = floor(${i.salaryCents} × ${days} / ${wd}) = ${absence}`);
  }
  for (const d of i.manualDeductions) trace.push(`potongan ${d.label} = ${d.amountCents}`);
  const deductions = absence + manual;
  const net = gross - deductions;
  if (net < 0n) throw new PayrollError("Potongan melebihi gaji kotor.");
  trace.push(`gaji bersih = ${gross} - ${deductions} = ${net}`);
  return {
    baseSalaryCents: i.salaryCents, allowancesCents: allowances, grossCents: gross, absentDays: i.absentDays,
    absenceDeductionCents: absence, manualDeductionsCents: manual, deductionsCents: deductions, netCents: net, trace,
  };
}
