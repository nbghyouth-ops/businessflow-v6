export const ROLES = ["owner", "manager", "cashier", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const MODULES = [
  "finance", "sales", "inventory", "purchasing", "crm", "hr", "tasks", "booking",
  "ops", "marketing", "projects", "assets", "reports", "export", "settings", "devices", "audit", "members",
  "marketplace", "personal", "bridge", "forecast", "bi", "storefront", "rfq", "learning", "import",
] as const;
export type Module = (typeof MODULES)[number];
export type Permission = `${Module}:${"read" | "write" | "create" | "approve" | "manage"}`;

/**
 * Matriks izin target (prompt §7.3). Terjemahan operasional yang dipakai:
 * "sesuai penugasan" / "izin eksplisit" = DITOLAK secara default untuk peran non-owner.
 * "baca bila diizinkan" untuk viewer = hanya modul non-sensitif (tanpa HR/payroll, settings,
 * devices, audit, members, personal, export). Konsekuensinya, route sensitif gagal 403.
 */
const spec = (entries: string[]) => new Set(entries);
const rw = (...m: Module[]) => m.flatMap((x) => [`${x}:read`, `${x}:write`]);
const rwc = (...m: Module[]) => m.flatMap((x) => [`${x}:read`, `${x}:write`, `${x}:create`]);
const r = (...m: Module[]) => m.map((x) => `${x}:read`);

const ROLE_PERMS: Record<Exclude<Role, "owner">, ReadonlySet<string>> = {
  // Manager: operasional harian, tanpa HR/payroll, tanpa approve keuangan/periode,
  // tanpa ekspor sensitif, tanpa kelola perangkat/anggota/audit, tanpa data owner.
  manager: spec([
    ...rwc("finance", "sales", "inventory", "purchasing", "crm", "tasks", "booking", "ops", "marketing", "projects", "assets", "rfq"),
    ...rwc("reports", "settings"),
    ...r("devices", "forecast", "bi", "storefront", "learning"),
    // REG-02: manager boleh mengekspor laporan operasional/penjualan/stok/keuangan
    // non-sensitif. Ekspor HR/payroll/PII dan Ruang Pribadi tetap hanya owner.
    "export:read",
    "export:create",
    "purchasing:approve",
  ]),
  // Kasir: penjualan + baca data penunjang. Tidak ada keuangan, pembelian, HR, pengaturan.
  cashier: spec([
    ...rwc("sales", "booking"),
    ...r("crm", "inventory", "tasks", "ops", "marketplace", "storefront", "learning", "rfq"),
  ]),
  // Staf: tugas/operasional/booking; baca CRM & inventori. Tidak ada penjualan/keuangan.
  staff: spec([...rwc("tasks", "ops", "booking"), ...r("crm", "inventory", "learning")]),
  // Viewer: baca modul non-sensitif saja.
  viewer: spec([
    ...r("sales", "inventory", "purchasing", "crm", "tasks", "booking", "ops",
      "marketing", "projects", "assets", "reports", "bi", "learning"),
  ]),
};

export function can(role: string, perm: Permission): boolean {
  if (role === "owner") return true;
  return ROLE_PERMS[role as Exclude<Role, "owner">]?.has(perm) ?? false;
}

/** Dipakai tes & UI untuk menampilkan alasan penolakan tanpa membocorkan detail internal. */
export function permsFor(role: string): ReadonlySet<string> {
  if (role === "owner") {
    const all = new Set<string>();
    for (const m of MODULES) for (const a of ["read", "write", "create", "approve", "manage"]) all.add(`${m}:${a}`);
    return all;
  }
  return ROLE_PERMS[role as Exclude<Role, "owner">] ?? new Set<string>();
}
