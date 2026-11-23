/**
 * Registri fitur (prompt R7 §5.1).
 *
 * Tiga status saja:
 *  - `REAL`          — rute ada, tertaut ke pengguna, dan punya rujukan bukti;
 *  - `HIDDEN`        — halaman ada tetapi **tidak** tertaut dari navigasi/pencarian
 *                      (sebagian dibangun; masih dapat dibuka lewat URL langsung —
 *                      lihat catatan di `scripts/verify-completion.mjs` gerbang (h));
 *  - `NOT_IMPLEMENTED` — belum dibangun: tidak ada halaman dan tidak ada tautan.
 *
 * Registri ini dipakai gerbang (h); navigasi tetap dibangun `src/lib/navigation.ts`
 * (segala `REAL` di sini harus muncul di sana bila memang modul pengguna).
 */
export type FeatureStatus = "REAL" | "HIDDEN" | "NOT_IMPLEMENTED";

export type FeatureEntry = {
  /** Pola rute halaman (relatif, tanpa grup `(app)`). */
  route: string;
  status: FeatureStatus;
  /** Rujukan bukti: berkas/laporan yang memuat hasil ujinya. */
  evidence: string;
  /**
   * Dinyatakan `true` untuk SETIAP entri: fitur ini tidak menambah kemampuan
   * pembayaran/penyambungan pihak ketiga. Diverifikasi pemindai G-NOPAY
   * (`scripts/scan-nopay.mjs`) dan gerbang (h) `verify-completion`. Entri yang
   * melanggar larangan §1 tidak boleh ada di sini.
   */
  noPayCheck: true;
};

export const FEATURES: FeatureEntry[] = [
  // Publik & pra-autentikasi
  { route: "/", noPayCheck: true, status: "REAL", evidence: "e2e/responsive-a11y (halaman publik)" },
  { route: "/sign-in", noPayCheck: true, status: "REAL", evidence: "e2e/responsive-a11y + PANDUAN_DEPLOY (login Google manual)" },
  { route: "/onboarding", noPayCheck: true, status: "REAL", evidence: "smoke-api 180 + e2e fixture onboarding" },
  { route: "/pair", noPayCheck: true, status: "REAL", evidence: "smoke-api (perangkat/PIN)" },
  { route: "/guide", noPayCheck: true, status: "REAL", evidence: "e2e/responsive-a11y (publik)" },
  { route: "/s/[slug]", noPayCheck: true, status: "REAL", evidence: "smoke-v6 (katalog informasi baca-saja; penjaga 404 untuk rute permintaan lama)" },
  { route: "/invite", noPayCheck: true, status: "HIDDEN", evidence: "halaman ada; belum tertaut dari navigasi" },

  // Modul pengguna (navigasi)
  { route: "/dashboard", noPayCheck: true, status: "REAL", evidence: "e2e/responsive-a11y + ui-integrity" },
  { route: "/finance", noPayCheck: true, status: "REAL", evidence: "smoke-api + integration (jurnal)" },
  { route: "/sales", noPayCheck: true, status: "REAL", evidence: "smoke-api + chaos C1/C2 + e2e" },
  { route: "/documents", noPayCheck: true, status: "REAL", evidence: "tests/unit/document-pdf.test.ts + tests/integration/documents.test.ts (nomor tanpa celah 50 paralel, immutable, RLS) + smoke-v6" },
  { route: "/products", noPayCheck: true, status: "REAL", evidence: "smoke-api + chaos INV" },
  { route: "/products/new", noPayCheck: true, status: "REAL", evidence: "build 53 rute + e2e ui-integrity" },
  { route: "/products/[id]/edit", noPayCheck: true, status: "REAL", evidence: "build + e2e ui-integrity" },
  { route: "/purchasing", noPayCheck: true, status: "REAL", evidence: "smoke-api (PO/terima/tagihan)" },
  { route: "/crm", noPayCheck: true, status: "REAL", evidence: "smoke-api" },
  { route: "/crm/[id]", noPayCheck: true, status: "REAL", evidence: "e2e responsive-a11y" },
  { route: "/bookings", noPayCheck: true, status: "REAL", evidence: "smoke-api (BF-008)" },
  { route: "/marketplace", noPayCheck: true, status: "REAL", evidence: "smoke-v6 (pencatatan marketplace record-only; tanpa kredensial/penyambungan)" },
  { route: "/storefront", noPayCheck: true, status: "REAL", evidence: "smoke-v6 (katalog informasi; tanpa formulir peminat)" },
  { route: "/rfq", noPayCheck: true, status: "REAL", evidence: "smoke-v6" },
  { route: "/hr", noPayCheck: true, status: "REAL", evidence: "smoke-api (payroll)" },
  { route: "/tasks", noPayCheck: true, status: "REAL", evidence: "e2e responsive-a11y" },
  { route: "/operations", noPayCheck: true, status: "REAL", evidence: "smoke-api (sesi kas)" },
  { route: "/marketing", noPayCheck: true, status: "REAL", evidence: "e2e responsive-a11y" },
  { route: "/projects", noPayCheck: true, status: "REAL", evidence: "e2e responsive-a11y" },
  { route: "/assets", noPayCheck: true, status: "REAL", evidence: "smoke-api (penyusutan)" },
  { route: "/personal", noPayCheck: true, status: "REAL", evidence: "integration isolasi RLS personal" },
  { route: "/bridge", noPayCheck: true, status: "REAL", evidence: "integration (jembatan bisnis/pribadi)" },
  { route: "/reports", noPayCheck: true, status: "REAL", evidence: "smoke-api + unit engine" },
  { route: "/reports/export", noPayCheck: true, status: "REAL", evidence: "chaos E4 artefak ekspor 22/22" },
  { route: "/reports/marketplace-performance", noPayCheck: true, status: "REAL", evidence: "tests/integration/report-metrics.test.ts (angka tangan + RLS) + smoke" },
  { route: "/reports/revenue-overview", noPayCheck: true, status: "REAL", evidence: "tests/integration/report-metrics.test.ts (angka tangan + RLS) + smoke" },
  { route: "/reports/profit-loss", noPayCheck: true, status: "REAL", evidence: "tests/integration/report-metrics.test.ts (Beban ≠ Kewajiban, HPP) + smoke" },
  { route: "/forecast", noPayCheck: true, status: "REAL", evidence: "smoke-v6" },
  { route: "/insights", noPayCheck: true, status: "REAL", evidence: "smoke-v6 (BI)" },
  { route: "/settings", noPayCheck: true, status: "REAL", evidence: "e2e responsiv-a11y" },
  { route: "/settings/language", noPayCheck: true, status: "REAL", evidence: "e2e/locale REG-01" },
  { route: "/settings/security", noPayCheck: true, status: "REAL", evidence: "e2e responsive-a11y (anggota/sesi)" },
  { route: "/import", noPayCheck: true, status: "REAL", evidence: "smoke-v6 (11 template + 13 preset pencatatan, pratinjau kering & commit idempoten) + integration" },
  { route: "/templates", noPayCheck: true, status: "REAL", evidence: "smoke-v6 (template bisnis)" },
  { route: "/devices", noPayCheck: true, status: "REAL", evidence: "smoke-api (perangkat/PIN)" },
  { route: "/legal", noPayCheck: true, status: "REAL", evidence: "smoke-v6 (syarat & privasi)" },
  { route: "/learn", noPayCheck: true, status: "REAL", evidence: "smoke-v6 (pembelajaran)" },
  { route: "/help", noPayCheck: true, status: "REAL", evidence: "e2e responsive-a11y" },

  // Halaman yang ada tetapi belum tertaut (sebagian dibangun)
  { route: "/finance/forecast", noPayCheck: true, status: "HIDDEN", evidence: "halaman ada; belum tertaut" },
  { route: "/finance/owner-bridge", noPayCheck: true, status: "HIDDEN", evidence: "halaman ada; belum tertaut" },
  { route: "/personal/reports", noPayCheck: true, status: "HIDDEN", evidence: "halaman ada; belum tertaut" },
  { route: "/reports/activity", noPayCheck: true, status: "HIDDEN", evidence: "halaman ada; belum tertaut" },
  { route: "/reports/bi", noPayCheck: true, status: "HIDDEN", evidence: "halaman ada; belum tertaut" },
  { route: "/reports/marketplace", noPayCheck: true, status: "HIDDEN", evidence: "halaman ada; belum tertaut" },
  { route: "/operations/production", noPayCheck: true, status: "HIDDEN", evidence: "halaman ada; belum tertaut" },
  { route: "/settings/system-status", noPayCheck: true, status: "HIDDEN", evidence: "halaman status; belum tertaut" },

  // Kontrak R7 §5.4 yang BELUM dibangun (tidak ada halaman, tidak ada tautan)
  { route: "/settings/rules", noPayCheck: true, status: "REAL", evidence: "tests/integration/loyalty-rules.test.ts (aturan dipakai forecast) + smoke-v6" },
  { route: "/settings/sandbox", noPayCheck: true, status: "NOT_IMPLEMENTED", evidence: "FR-03 demo sandbox belum dibangun" },
  { route: "/marketing/vouchers", noPayCheck: true, status: "REAL", evidence: "tests/unit/voucher-discount.test.ts + integration (kuota atomik, RLS) + smoke-v6" },
  { route: "/purchasing/suppliers", noPayCheck: true, status: "REAL", evidence: "tests/integration/loyalty-rules.test.ts (CRUD + RLS) + smoke-v6" },
];
