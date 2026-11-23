# MATRIKS IZIN — Business Flow (implementasi `can(role, perm)`)

Diperbarui: 19 November 2026 (putaran R3).
Sumber aturan: prompt §7.3 + Master PRD v5.0 (lima peran, tanpa "admin").
Bukti otomatis: `tests/unit/permissions-matrix.test.ts` (7 tes) dan smoke kontrak izin 5 peran.

## Prinsip

1. Hanya lima peran: `owner, manager, cashier, staff, viewer`. Peran tak dikenal **ditolak** (gagal tertutup).
2. `owner` selalu `true` untuk semua modul/aksi.
3. "Sesuai penugasan" / "izin eksplisit" = **ditolak secara default** untuk non-owner.
4. Viewer = baca modul non-sensitif saja. Tidak ada akses HR/payroll, keuangan, pengaturan,
   perangkat, audit, anggota, ekspor, personal.
5. Personal Finance hanya owner (RLS dua lapis di lapisan data, bukan hanya UI).

## Matriks modul

| Modul | owner | manager | cashier | staff | viewer |
|---|---|---|---|---|---|
| finance | read/write/create/approve/manage | read/write/create | — | — | — |
| sales | semua | read/write/create | read/write/create | — | read |
| inventory | semua | read/write/create | read | read | read |
| purchasing | semua | read/write/create/approve | — | — | read |
| crm | semua | read/write/create | read | read | read |
| hr | semua | — | — | — | — |
| tasks | semua | read/write/create | read | read/write/create | read |
| booking | semua | read/write/create | read/write/create | read/write/create | read |
| ops | semua | read/write/create | read | read/write/create | read |
| marketing | semua | read/write/create | — | — | read |
| projects | semua | read/write/create | — | — | read |
| assets | semua | read/write/create | — | — | read |
| reports | semua | read/write/create | — | — | read |
| export | semua | read + create (owner & manager); HR/payroll/PII & Personal hanya owner | — | — | — |
| settings | semua | read/write/create | — | — | — |
| devices | semua | read | — | — | — |
| audit | semua | — | — | — | — |
| members | semua | — | — | — | — |
| marketplace | semua | — | read | — | — |
| personal | semua | — | — | — | — |
| bridge | semua | — | — | — | — |
| forecast | semua | read | — | — | — |
| bi | semua | read | — | — | read |
| storefront | semua | read | read | — | — |
| rfq | semua | read/write/create | read | — | — |
| learning | semua | read | read | read | read |
| import | semua | — | — | — | — |

## Perubahan dari R2 (yang tadinya terlalu longgar)

| Sel | R2 | R3 | Alasan |
|---|---|---|---|
| `manager:hr:read/write` | ya | tidak | HR/payroll hanya owner / manajer HR berwenang (default aman) |
| `manager:finance:approve` | ya | tidak | Approve & tutup periode = izin eksplisit |
| `manager:export:create` | ya (REG-02) | tidak | Laporan operasional/penjualan/stok/keuangan; ekspor HR/payroll/PII & Personal tetap tertutup (`hr:read`/`personal:read` = false) |
| `manager:audit:read`, `members:*` | sebagian | tidak | Bukan kewenangan operasional manager |
| `cashier:export:create`, `crm:write` | ya | tidak | Kasir mencatat penjualan; CRM baca saja |
| `staff:booking/sales:write` | booking ya, sales tidak | sama (booking write dipertahankan) | Staf menangani jadwal |
| `viewer:finance/hr/reports` | finance & hr ya | finance & hr tidak; reports ya | Viewer tidak membaca HR/payroll/keuangan |

## Konsekuensi UI

- Item navigasi dengan izin yang tidak dimiliki **tidak tampil** (`visible()` di `shell.tsx`).
- Route server mengembalikan `403 forbidden` untuk sel yang ditolak — diuji smoke:
  kasir → `/finance/transactions` 403, kasir → `/devices/pairing` 403.
- Data owner (Personal) tetap dijaga RLS dua lapis di database; UI saja tidak cukup.

## Yang belum diuji

- Matriks 5 peran × **setiap** route (ratusan kombinasi) belum dijalankan otomatis penuh;
  smoke menguji kontrak peran utama (owner, kasir, manager, staff, viewer pada alur undangan).
  Status: `PARTIAL`.
