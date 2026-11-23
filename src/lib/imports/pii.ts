/**
 * Penyamaran PII untuk catatan impor (dipindah dari `normalize.ts` saat mesin
 * impor lama dibongkar pada R11-A). Murni dan deterministik: nilai asli tidak dapat
 * dipulihkan dari hasilnya, dan hasilnya stabil untuk nilai yang sama.
 */

const PII = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  phone: /(?:\+?62|0)8[1-9][0-9]{6,11}\b/g,
  nik: /\b[0-9]{16}\b/g,
  account: /\b[0-9]{10,20}\b/g,
};

/** FNV-1a 32-bit: hanya untuk penyamaran deterministik, bukan kriptografi. */
export function hash4(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 8);
}

/** Samarkan PII: bentuk tetap, nilai tidak dapat dipulihkan. */
export function maskPii(value: string): string {
  // Jalur cepat (R17 §2.2b): email/telepon/NIK/rekening selalu mengandung digit atau
  // '@'. Teks tanpa keduanya tidak mungkin cocok, jadi empat pemindaian regex dilewati.
  if (!/[0-9@]/.test(value)) return value;
  return value
    .replace(PII.email, (m) => `email#${hash4(m.toLowerCase())}`)
    .replace(PII.phone, (m) => `telp#${hash4(m)}`)
    .replace(PII.nik, (m) => `nik#${hash4(m)}`)
    .replace(PII.account, (m) => `akun#${m.slice(-4)}`);
}
