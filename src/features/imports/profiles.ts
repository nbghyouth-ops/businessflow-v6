/**
 * Mapping Profile berversi IMMUTABLE (prompt R10 §A2/AL-1, §A3.3, §D-31).
 *
 * Aturan yang ditegakkan di sini (murni):
 *  - profil dibuat hanya dari pemetaan yang DIKONFIRMASI pengguna;
 *  - versi tidak pernah diubah di tempat — perubahan = versi baru;
 *  - saat dipakai ulang, sheet & semua kolom sumber disimpan harus masih ada dan
 *    UNIK. Ini validasi pemetaan biasa, bukan pencocokan kemiripan: tidak ada
 *    kemiripan header dan tidak ada hash berkas. Bila tidak cocok → `NEEDS_UPDATE`
 *    dan commit diblokir.
 */
import { normalizeHeader } from "@/lib/imports/csv";
import { validateMapping, type ColumnMap, type ParsingOptions } from "./mapping-engine";
import type { ReportTypeDef } from "./canonical-fields";
import type { ProfileStatus } from "./state";

export type ProfileSnapshot = {
  sheetName: string | null;
  headerRow: number;
  mapping: ColumnMap;
  parsing: ParsingOptions;
};

export type ProfileMatch = {
  status: ProfileStatus;
  ok: boolean;
  missingHeaders: string[];
  duplicateHeaders: string[];
  missingSheet: boolean;
  reason?: string;
};

/** Kolom sumber yang disimpan versi profil (nama header yang dipilih pengguna). */
export function storedHeaders(snapshot: ProfileSnapshot): string[] {
  return [...new Set(Object.values(snapshot.mapping).filter((h): h is string => Boolean(h)))];
}

export function matchProfile(
  report: ReportTypeDef,
  snapshot: ProfileSnapshot,
  input: { sheetName: string | null; headers: string[]; parseable: boolean },
): ProfileMatch {
  if (!input.parseable) {
    return { status: "NEEDS_UPDATE", ok: false, missingHeaders: [], duplicateHeaders: [], missingSheet: false, reason: "header_not_chosen" };
  }
  const counts = new Map<string, number>();
  for (const h of input.headers) {
    const k = normalizeHeader(h);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const missingHeaders = storedHeaders(snapshot).filter((h) => !counts.has(normalizeHeader(h)));
  const duplicateHeaders = storedHeaders(snapshot).filter((h) => (counts.get(normalizeHeader(h)) ?? 0) > 1);
  const missingSheet = Boolean(snapshot.sheetName) && snapshot.sheetName !== input.sheetName;
  const mappingCheck = validateMapping(report, input.headers, snapshot.mapping);
  const ok = missingHeaders.length === 0 && duplicateHeaders.length === 0 && !missingSheet && mappingCheck.ok;
  return {
    status: ok ? "USER_CONFIRMED" : "NEEDS_UPDATE",
    ok,
    missingHeaders,
    duplicateHeaders,
    missingSheet,
    reason: ok ? undefined : "source_structure_changed",
  };
}

/** Ringkasan manusiawi untuk banner konfirmasi (tidak ada klaim "terverifikasi otomatis"). */
export function profileSummary(name: string, snapshot: ProfileSnapshot, report: ReportTypeDef): string {
  const mapped = Object.entries(snapshot.mapping).filter(([, h]) => Boolean(h)).length;
  return `${name} — ${report.label}: ${mapped} kolom dipetakan, sheet "${snapshot.sheetName ?? "-"}", header baris ${snapshot.headerRow + 1}.`;
}
