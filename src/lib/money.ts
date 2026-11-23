/**
 * Aritmetika uang tanpa floating point. Nilai disimpan NUMERIC(18,2); internal = sen (BigInt).
 *
 * BF-018/BF-020: satu-satunya tempat rumus uang. Tidak ada `Number` pada jalur perhitungan
 * maupun pada pemformatan angka besar — pemformatan memakai BigInt sehingga nilai di atas
 * 2^53 tidak lagi kehilangan digit.
 */
export const CURRENCY_DECIMALS: Record<string, number> = { IDR: 0, JPY: 0, USD: 2, EUR: 2, SGD: 2, MYR: 2 };
export class MoneyError extends Error {}
export const decimalsOf = (currency: string) => CURRENCY_DECIMALS[currency] ?? 2;

const MONEY_RE = /^\d{1,15}(\.\d{1,2})?$/;
const QTY_RE = /^\d{1,15}(\.\d{1,3})?$/;
const CURRENCY_SYMBOL: Record<string, string> = { IDR: "Rp", JPY: "JP¥", USD: "US$", EUR: "€", SGD: "SGD", MYR: "RM" };
const NBSP = "\u00A0";

export function toCents(input: string | number): bigint {
  const s = typeof input === "number" ? String(input) : input.trim();
  if (!MONEY_RE.test(s)) throw new MoneyError(`Nominal tidak valid: ${s}`);
  const [i, f = ""] = s.split(".");
  return BigInt(i) * 100n + BigInt(f.padEnd(2, "0"));
}

export function fromCents(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  const s = `${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

/** Parse kuantitas (maks 3 desimal) ke satuan milli. */
export function toMilli(input: string | number): bigint {
  const s = typeof input === "number" ? String(input) : input.trim();
  if (!QTY_RE.test(s)) throw new MoneyError(`Kuantitas tidak valid: ${s}`);
  const [i, f = ""] = s.split(".");
  return BigInt(i) * 1000n + BigInt(f.padEnd(3, "0"));
}

export function fromMilli(m: bigint): string {
  const neg = m < 0n;
  const a = neg ? -m : m;
  const s = `${a / 1000n}.${(a % 1000n).toString().padStart(3, "0")}`;
  return neg ? `-${s}` : s;
}

/** qty × harga satuan, pembulatan half-up ke sen. */
export function mulQty(qty: string, unit: string): bigint {
  return (toMilli(qty) * toCents(unit) + 500n) / 1000n;
}

/**
 * persen (mis. "11" atau "11.5") dari nilai sen, half-up.
 * Basis point dihitung dari string agar tidak melewati floating point ("7.25" → 725 bp).
 */
export function percentOf(cents: bigint, percent: string): bigint {
  const s = String(percent).trim();
  const m = /^(-?)(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new MoneyError(`Persentase tidak valid: ${s}`);
  const bp = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0"));
  const signed = m[1] === "-" ? -bp : bp;
  return (cents * signed + 5000n) / 10000n;
}

/** Validasi presisi sesuai mata uang (IDR tidak boleh pecahan). */
export function assertCurrencyPrecision(value: string, currency: string) {
  const d = decimalsOf(currency);
  const frac = value.split(".")[1] ?? "";
  if (frac.length > d && /[1-9]/.test(frac.slice(d))) {
    throw new MoneyError(`Mata uang ${currency} hanya mendukung ${d} desimal.`);
  }
}

type Parsed = { neg: boolean; whole: string; frac: string };

/** Parse desimal "1234.5" / "-7" tanpa Number. */
function parseDecimal(input: string): Parsed | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!m) return null;
  return { neg: m[1] === "-", whole: m[2], frac: m[3] ?? "" };
}

function roundFrac(frac: string, d: number): { frac: string; carry: boolean } {
  if (d === 0) return { frac: "", carry: frac.length > 0 && frac[0] >= "5" };
  if (frac.length <= d) return { frac: frac.padEnd(d, "0"), carry: false };
  const keep = frac.slice(0, d);
  if (frac[d] < "5") return { frac: keep, carry: false };
  const inc = (BigInt(keep) + 1n).toString();
  if (inc.length > d) return { frac: "0".repeat(d), carry: true };
  return { frac: inc.padStart(d, "0"), carry: false };
}

/**
 * F-11: format uang tidak pernah melempar error dan tidak pernah menampilkan NaN.
 * Mata uang tidak dikenal → IDR. Nilai tidak valid → "—".
 * Pemformatan berbasis BigInt agar nominal besar tetap presisi (BF-018).
 */
export function formatMoney(value: string | number | null | undefined, currency = "IDR"): string {
  const code = typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "IDR";
  const d = CURRENCY_DECIMALS[code] ?? 2;

  if (typeof value === "number" && !Number.isFinite(value)) return "—";
  const raw =
    value === null || value === undefined ? "0" : typeof value === "number" ? String(value) : String(value).trim();
  if (raw === "") return "—";

  const parsed = parseDecimal(raw);
  if (!parsed) {
    // Notasi eksponensial (mis. 1e+21) atau format asing: biarkan Intl yang menangani.
    if (typeof value === "number" && Number.isFinite(value)) {
      try {
        return new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: code,
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        }).format(value);
      } catch {
        /* jatuh ke "—" */
      }
    }
    return "—";
  }

  const { frac, carry } = roundFrac(parsed.frac, d);
  const whole = (BigInt(parsed.whole) + (carry ? 1n : 0n)).toString();
  let grouped: string;
  try {
    grouped = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(BigInt(whole));
  } catch {
    grouped = groupDigits(whole);
  }
  const sym = CURRENCY_SYMBOL[code] ?? code;
  const sign = parsed.neg && (whole !== "0" || /[1-9]/.test(frac)) ? "-" : "";
  return `${sign}${sym}${NBSP}${grouped}${d > 0 ? `,${frac}` : ""}`;
}

/** Format input keypad: "1250000" -> "1.250.000". */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
