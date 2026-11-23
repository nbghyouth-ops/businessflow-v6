"use client";

import { tr } from "@/lib/tr";
import Link from "next/link";
import { useState } from "react";
import { DualBarChart, SplineAreaChart } from "@/components/charts";
import { Reveal } from "@/components/motion";
import { downloadFinanceTemplateExcel } from "@/lib/excel-export";
import { QuickTx } from "@/components/quick-tx";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Kpi, Loading, PageHeader, Tabs, TextField } from "@/components/ui";
import { downloadCsv, fmtDateTime, toInputDate, useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";

const ACTION_LABEL: Record<string, string> = {
  "transaction.posted": "Transaksi diposting",
  "transaction.draft": "Draf transaksi",
  "transaction.pending_approval": "Menunggu persetujuan",
  "transaction.reversed": "Transaksi dibalik",
  "sale.recorded": "Penjualan dicatat",
  "sale.checkout": "Penjualan (catatan lama)", // nilai lama pada baris audit yang sudah ada
  create: "Data dibuat",
  update: "Data diubah",
  "invoice.payment": "Pembayaran faktur",
  "po.receive": "Penerimaan barang",
  "stock.adjust": "Penyesuaian stok",
  "workspace.create": "Bisnis dibuat",
};

function icon(path: React.ReactNode) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {path}
    </svg>
  );
}
const WalletIcon = () => icon(<><path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v2h-4a3 3 0 000 6h4v2a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /><circle cx="17" cy="12" r="1" /></>);
const TrendUpIcon = () => icon(<><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></>);
const ReceiptIcon = () => icon(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6M9 16h4" /></>);
const ScaleIcon = () => icon(<><path d="M12 3v18M5 21h14M4 8l3 6a3 3 0 01-6 0l3-6zm16 0l3 6a3 3 0 01-6 0l3-6zM4 8h16" /></>);
const ArrowUpRight = () => icon(<><path d="M7 17L17 7M9 7h8v8" /></>);
const ArrowDownLeft = () => icon(<><path d="M17 7L7 17M15 17H7V9" /></>);
const SwapIcon = () => icon(<><path d="M4 8h13l-3-3M20 16H7l3 3" /></>);

export default function Dashboard() {
  const biz = useBiz();
  const d0 = new Date();
  const f0 = new Date();
  f0.setDate(f0.getDate() - 29);
  const [from, setFrom] = useState(toInputDate(f0));
  const [to, setTo] = useState(toInputDate(d0));
  const [tab, setTab] = useState("overview");
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const { data, error, loading, reload } = useApi<any>(`/dashboard?from=${from}&to=${to}`);
  const me = useApi<any>("/account/me");
  const canFinance = biz.can("finance:read");
  const accountsApi = useApi<any>(canFinance ? "/finance/cash-accounts" : null);
  const txApi = useApi<any>(tab === "finance" && canFinance ? "/finance/transactions?limit=8" : null);
  const clientsApi = useApi<any>(biz.can("crm:read") ? "/r/clients?limit=8" : null);
  const [qt, setQt] = useState(false);

  const cur = biz.currency;
  const fin = data?.finance;
  const series: any[] = fin?.series ?? [];
  const m = (v: string | number) => formatMoney(v, cur);
  const accounts: any[] = accountsApi.data?.items ?? [];
  const activeAccount = accounts[0]?.id;

  const userName: string | undefined = me.data?.user?.name;
  const firstName = userName?.trim().split(/\s+/)[0];

  const exportCsv = () => {
    if (!fin) return;
    downloadCsv(
      `ringkasan-${from}_${to}.csv`,
      [
        { key: "day", label: tr("Tanggal") },
        { key: "income", label: tr("Pendapatan") },
        { key: "expense", label: tr("Beban") },
      ],
      series,
    );
  };

  const alerts: { tone: "critical" | "warn" | "info"; title: string; sub: string; badge: string; href: string }[] = [];
  if (fin?.pendingApprovals > 0) {
    alerts.push({ tone: "critical", title: `${fin.pendingApprovals} pengeluaran menunggu persetujuan`, sub: "Perlu tinjauan pengelola", badge: "Perlu aksi", href: "/finance" });
  }
  if (data?.tasks?.overdue > 0) {
    alerts.push({ tone: "critical", title: `${data.tasks.overdue} tugas melewati tenggat`, sub: "Periksa jadwal tim", badge: "Tenggat", href: "/tasks" });
  }
  if (data?.lowStock?.length > 0) {
    alerts.push({ tone: "warn", title: `${data.lowStock.length} produk stok menipis`, sub: data.lowStock.slice(0, 2).map((p: any) => p.name).join(", "), badge: "Stok", href: "/products" });
  }
  if (fin && Number(fin.budget?.budget) > 0) {
    const pct = Math.round((Number(fin.budget.actual) / Number(fin.budget.budget)) * 100);
    alerts.push({ tone: pct >= 90 ? "warn" : "info", title: `Pemakaian anggaran ${pct}%`, sub: `${m(fin.budget.actual)} dari ${m(fin.budget.budget)}`, badge: "Anggaran", href: "/finance" });
  }

  const chartData = series.map((s) => ({ label: s.day, a: Number(s.income), b: Number(s.expense) }));

  return (
    <>
      <PageHeader
        label={tr("Beranda")}
        title={firstName ? `Halo, ${firstName}!` : "Halo!"}
        desc={`Ringkasan keuangan ${biz.business.name} dalam satu tampilan.`}
        actions={
          <>
            <TextField label={tr("Dari")} type="date" value={from} onChange={setFrom} max={to} />
            <TextField label={tr("Sampai")} type="date" value={to} onChange={setTo} min={from} />
            {fin && (
              <Button variant="secondary" onClick={exportCsv} disabled={!series.length}>
                Ekspor CSV
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { key: "overview", label: tr("Ringkasan") },
            ...(canFinance ? [{ key: "finance", label: tr("Keuangan") }] : []),
          ]}
          value={tab}
          onChange={setTab}
        />
        <div data-tour="quick" className="flex flex-wrap gap-2">
          {biz.can("finance:write") && <Button onClick={() => setQt(true)}>+ Transaksi cepat</Button>}
          {biz.can("sales:write") && (
            <Link href="/sales" className="inline-flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-surface">
              Penjualan baru
            </Link>
          )}
          {biz.can("reports:read") && (
            <Link href="/reports/export" className="inline-flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-surface">
              Pusat ekspor
            </Link>
          )}
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        data &&
        tab === "overview" && (
          <div className="grid gap-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,48fr)_minmax(0,52fr)]">
              {/* ── Kolom kiri ── */}
              <div className="grid min-w-0 gap-5">
                {/* Kartu Total Kas & Bank */}
                <Reveal>
                  <section className="balance-card" aria-labelledby="balance-title" data-metric-id="cash.total">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p id="balance-title" className="text-[12.5px] font-semibold text-[var(--color-on-accent)]">Total Kas &amp; Bank</p>
                        <p className="mt-1.5 truncate text-[32px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[38px]">
                          {fin ? m(fin.cashTotal) : "—"}
                        </p>
                        <p className="mt-1 text-[11.5px] font-medium text-[var(--color-on-accent)]">
                          Saldo terposting seluruh akun kas/bank · {from} s.d. {to}
                        </p>
                      </div>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/70 text-ink" aria-hidden>
                        <WalletIcon />
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {biz.can("finance:write") && (
                        <button type="button" onClick={() => setQt(true)} className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl bg-white/70 px-2 py-2 text-[11.5px] font-semibold text-ink hover:bg-white">
                          <span aria-hidden><ArrowDownLeft /></span>
                          Catat transaksi
                        </button>
                      )}
                      {biz.can("sales:write") && (
                        <Link href="/sales" className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl bg-white/70 px-2 py-2 text-[11.5px] font-semibold text-ink hover:bg-white">
                          <span aria-hidden><ReceiptIcon /></span>
                          Penjualan
                        </Link>
                      )}
                      {canFinance && (
                        <Link href="/finance" className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl bg-white/70 px-2 py-2 text-[11.5px] font-semibold text-ink hover:bg-white">
                          <span aria-hidden><SwapIcon /></span>
                          Transfer
                        </Link>
                      )}
                      {biz.can("reports:read") && (
                        <Link href="/reports" className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl bg-white/70 px-2 py-2 text-[11.5px] font-semibold text-ink hover:bg-white">
                          <span aria-hidden><ArrowUpRight /></span>
                          Laporan
                        </Link>
                      )}
                    </div>
                  </section>
                </Reveal>

                {/* Akses cepat klien */}
                {biz.can("crm:read") && (
                  <Card
                    title={tr("Akses cepat klien")}
                    desc={tr("Klien terbaru di workspace ini")}
                    actions={
                      <Link href="/crm" className="text-xs font-semibold text-ink underline">
                        Kelola klien
                      </Link>
                    }
                  >
                    {clientsApi.loading ? (
                      <Loading text="Memuat klien…" />
                    ) : (
                      <div className="scroll-snap-x">
                        <Link href="/crm" className="account-card grid place-items-center text-center">
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-bold text-ink" aria-hidden>+</span>
                          <span className="mt-1.5 block text-[11.5px] font-semibold text-ink">{tr("Klien baru")}</span>
                        </Link>
                        {(clientsApi.data?.items ?? []).slice(0, 6).map((c: any) => (
                          <Link key={c.id} href={`/crm/${c.id}`} className="account-card">
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[11px] font-bold text-ink">
                              {String(c.name ?? "?").slice(0, 2).toUpperCase()}
                            </span>
                            <span className="mt-2 block truncate text-[12.5px] font-semibold text-ink">{c.name}</span>
                            <span className="block truncate text-[11px] text-ink-2">{c.phone || c.email || "Tanpa kontak"}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </Card>
                )}

                {/* Aktivitas terbaru */}
                <Card title={tr("Aktivitas terbaru")} desc={tr("Peristiwa sistem & transaksi terakhir")}>
                  {!data.recent?.length ? (
                    <Empty title={tr("Belum ada aktivitas")} hint={tr("Aktivitas penjualan, kas, dan stok akan muncul di sini.")} />
                  ) : (
                    <ul className="-mx-1 divide-y divide-divider">
                      {data.recent.slice(0, 8).map((a: any, i: number) => (
                        <li key={a.id ?? i} className="flex items-center gap-3 px-1 py-2.5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-ink-2" aria-hidden>
                            <ReceiptIcon />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-ink">{ACTION_LABEL[a.action] ?? a.action}</span>
                            <span className="block truncate text-[11.5px] text-ink-2">{a.operator ?? a.deviceName ?? "Perangkat"}</span>
                          </span>
                          <span className="shrink-0 text-[11px] text-ink-2">{fmtDateTime(a.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              {/* ── Kolom kanan ── */}
              <div className="grid min-w-0 gap-5">
                {/* Carousel akun */}
                <Card
                  title={tr("Akun kas & bank")}
                  desc={tr("Geser untuk melihat akun lain")}
                  actions={canFinance ? <Link href="/finance" className="text-xs font-semibold text-ink underline">{tr("Kelola")}</Link> : undefined}
                >
                  {!canFinance ? (
                    <Empty title={tr("Belum ada akses keuangan")} hint={tr("Akun kas & bank ditampilkan bila peran Anda memiliki izin keuangan.")} />
                  ) : accountsApi.loading && !accounts.length ? (
                    <Loading text="Memuat akun…" />
                  ) : !accounts.length ? (
                    <Empty title={tr("Belum ada akun kas")} hint={tr("Tambahkan akun kas atau bank di modul Keuangan.")} action={<Link href="/finance" className="inline-flex min-h-[44px] items-center rounded-xl bg-[var(--color-action)] px-4 text-sm font-semibold text-white">{tr("Buka Keuangan")}</Link>} />
                  ) : (
                    <div className="scroll-snap-x">
                      {accounts.map((acc: any) => (
                        <div key={acc.id} className="account-card" data-active={acc.id === activeAccount}>
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">{acc.type ?? "kas"}</span>
                          <span className="mt-1 block truncate text-[13px] font-bold text-ink">{acc.name}</span>
                          <span className="tnum mt-4 block text-[17px] font-semibold text-ink">{m(acc.balance ?? 0)}</span>
                          <Link href="/finance" className="mt-3 inline-flex min-h-[32px] items-center text-[11.5px] font-semibold text-ink underline">
                            Detail &amp; rekonsiliasi
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Statistik */}
                <Card
                  title={tr("Statistik")}
                  desc={`Pendapatan vs beban harian · ${from} s.d. ${to}`}
                  metricId="flow.chart"
                  actions={
                    <div role="group" aria-label={tr("Jenis grafik")} className="inline-flex rounded-full bg-surface p-1">
                      {([["bar", "Batang"], ["line", "Garis"]] as const).map(([k, l]) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={chartType === k}
                          onClick={() => setChartType(k)}
                          className={`min-h-[32px] rounded-full px-3 text-[11.5px] font-semibold ${chartType === k ? "bg-[var(--color-action)] text-white" : "text-ink-2"}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  }
                >
                  {!series.length ? (
                    <Empty
                      title={tr("Belum ada transaksi pada periode ini")}
                      hint={tr("Catat pemasukan atau penjualan pertama Anda agar grafik muncul.")}
                      action={biz.can("finance:write") ? <Button onClick={() => setQt(true)}>+ Transaksi cepat</Button> : undefined}
                    />
                  ) : chartType === "bar" ? (
                    <DualBarChart currency={cur} aLabel="Pemasukan" bLabel="Pengeluaran" data={chartData} summary={`Grafik batang pemasukan dan pengeluaran harian. Total pemasukan ${m(fin.income)}, total pengeluaran ${m(fin.expense)}.`} />
                  ) : (
                    <SplineAreaChart currency={cur} aLabel="Pemasukan" bLabel="Pengeluaran" data={chartData} summary={tr("Grafik garis pemasukan dan pengeluaran periode terpilih")} />
                  )}

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl bg-[var(--color-action)] p-4 text-white">
                      <p className="text-[11.5px] font-semibold text-white/70">{tr("Pemasukan")}</p>
                      <p className="tnum mt-1 text-[20px] font-semibold">{fin ? m(fin.income) : "—"}</p>
                    </div>
                    <div className="rounded-2xl bg-[var(--color-accent-soft)] p-4 text-ink">
                      <p className="text-[11.5px] font-semibold text-[var(--color-on-accent)]">{tr("Pengeluaran")}</p>
                      <p className="tnum mt-1 text-[20px] font-semibold">{fin ? m(fin.expense) : "—"}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-2">
                    Sumber: jurnal akuntansi terposting. Pendapatan, kas, dan laba adalah angka yang berbeda.
                  </p>
                </Card>
              </div>
            </div>

            {/* KPI operasional */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {fin && <Kpi pastel="lavender" icon={<WalletIcon />} label={tr("Piutang usaha")} value={m(fin.receivables.v)} hint={`${fin.receivables.n} faktur belum lunas`} />}
              {fin && <Kpi label={tr("Utang usaha")} value={m(fin.payables.v)} hint={`${fin.payables.n} tagihan supplier`} />}
              {data.sales && <Kpi icon={<TrendUpIcon />} label={tr("Penjualan periode")} value={m(data.sales.v)} hint={`${data.sales.n} faktur`} />}
              {data.tasks && <Kpi icon={<ScaleIcon />} label={tr("Tugas terbuka")} value={String(data.tasks.open)} hint={`${data.tasks.overdue} lewat tenggat`} tone={data.tasks.overdue > 0 ? "bad" : undefined} />}
            </div>

            <Card title={tr("Modul Business Flow v6")} desc={tr("Alur baru yang siap dipakai — tautan membuka data nyata, bukan contoh.")}>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { href: "/marketplace", label: tr("Marketplace"), desc: tr("Pesanan & settlement") },
                  { href: "/forecast", label: tr("Prakiraan Kas"), desc: "13 minggu ke depan", metric: "forecast.cash" },
                  { href: "/insights", label: tr("Intelijen Bisnis"), desc: tr("Margin & produk teratas") },
                  { href: "/storefront", label: tr("Etalase"), desc: tr("Katalog publik") },
                  { href: "/rfq", label: tr("RFQ"), desc: tr("Permintaan & kutipan") },
                  { href: "/personal", label: tr("Keuangan Pribadi"), desc: tr("Ruang terpisah") },
                  { href: "/bridge", label: tr("Jembatan Pemilik"), desc: tr("Modal & prive") },
                  { href: "/learn", label: tr("Pembelajaran"), desc: tr("Enam materi singkat") },
                ].map((m) => (
                  <Link key={m.href} href={m.href} data-metric-id={m.metric} className="rounded-2xl border border-line p-3 hover:border-[var(--color-primary-light)]">
                    <span className="block text-[13px] font-semibold text-ink">{m.label}</span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-2">{m.desc}</span>
                  </Link>
                ))}
              </div>
            </Card>

            <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <Card title={tr("Peringatan")} desc={tr("Pemantauan otomatis dari data aktual")}>
                {alerts.length === 0 ? (
                  <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-ink-2">{tr("Semua metrik aman. Tidak ada peringatan aktif.")}</p>
                ) : (
                  <ul className="grid gap-2.5 sm:grid-cols-2">
                    {alerts.map((a, idx) => (
                      <li key={idx} className="min-w-0">
                        <Link href={a.href} className="flex h-full items-start justify-between gap-3 rounded-2xl border border-line bg-white p-3.5 hover:border-[var(--color-primary-light)]">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-ink">{a.title}</p>
                            <p className="mt-0.5 truncate text-xs text-ink-2">{a.sub}</p>
                          </div>
                          <Badge tone={a.tone === "critical" ? "bad" : a.tone === "warn" ? "warn" : "info"}>{a.badge}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title={tr("Ekspor & templat")} desc={tr("Unduh data periode terpilih")}>
                <div className="grid gap-2">
                  <Button variant="secondary" onClick={exportCsv} disabled={!series.length} className="justify-start">
                    Ringkasan CSV
                  </Button>
                  <Button variant="secondary" onClick={() => void downloadFinanceTemplateExcel(biz.business.name, cur)} className="justify-start">
                    Template Excel keuangan
                  </Button>
                  {biz.can("reports:read") && (
                    <Link href="/reports/export" className="inline-flex min-h-[44px] items-center justify-between rounded-xl border border-line px-4 text-sm font-semibold text-ink hover:bg-surface">
                      Pusat ekspor <span aria-hidden>→</span>
                    </Link>
                  )}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-2">
                  Laporan &amp; aktivitas tersedia dalam PDF, JPG, PNG, XLSX, dan CSV. Struk tersedia dalam PDF, JPG, PNG.
                </p>
              </Card>
            </div>

            {fin && series.length === 0 && Number(data.sales?.n ?? 0) === 0 && biz.template?.workflow?.length > 0 && (
              <Card title={`Langkah awal untuk ${biz.template.name}`} desc={tr("Dari konfigurasi template bisnis Anda.")}>
                <ol className="grid gap-2 sm:grid-cols-2">
                  {biz.template.workflow.map((w: any, i: number) => (
                    <li key={i}>
                      <Link href={w.href} className="flex items-center gap-3 rounded-2xl border border-line p-3 text-sm font-medium hover:bg-primary-bg">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-xs font-bold text-ink">{i + 1}</span>
                        {w.text}
                      </Link>
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </div>
        )
      )}

      {data && tab === "finance" && fin && (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi pastel="lavender" icon={<WalletIcon />} label={tr("Total kas & bank")} value={m(fin.cashTotal)} hint={tr("Saldo konsolidasi")} />
            <Kpi icon={<TrendUpIcon />} label={tr("Piutang usaha")} value={m(fin.receivables.v)} hint={`${fin.receivables.n} faktur terbuka`} />
            <Kpi icon={<ReceiptIcon />} label={tr("Utang usaha")} value={m(fin.payables.v)} hint={`${fin.payables.n} tagihan belum lunas`} />
            <Kpi icon={<ScaleIcon />} label={tr("Menunggu persetujuan")} value={String(fin.pendingApprovals ?? 0)} hint={tr("Pengeluaran perlu approval")} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <Card
              title={tr("Saldo per akun kas & bank")}
              desc={tr("Daftar rekening & laci kas aktif")}
              metricId="cash.accounts"
              actions={<Link href="/finance" className="text-xs font-semibold text-ink underline">{tr("Kelola akun →")}</Link>}
            >
              {accountsApi.loading ? (
                <Loading />
              ) : !(accountsApi.data?.items?.length) ? (
                <Empty title={tr("Belum ada akun kas")} hint={tr("Tambahkan akun kas atau bank di modul Keuangan.")} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {accountsApi.data.items.map((acc: any) => (
                    <div key={acc.id} className="rounded-2xl border border-line bg-surface/60 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate font-semibold text-ink">{acc.name}</p>
                        <Badge tone="info">{acc.type ?? "kas"}</Badge>
                      </div>
                      <p className="tnum mt-2 text-xl font-semibold text-ink">{m(acc.balance ?? 0)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title={tr("Aksi cepat keuangan")} desc={tr("Catat atau tinjau transaksi langsung")}>
              <div className="grid gap-2.5">
                {biz.can("finance:write") && (
                  <Button onClick={() => setQt(true)} className="w-full justify-start">
                    + Catat pemasukan / pengeluaran / transfer
                  </Button>
                )}
                <Link href="/finance" className="inline-flex min-h-[44px] items-center justify-between rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-surface">
                  <span>Buka buku besar &amp; persetujuan</span><span aria-hidden>→</span>
                </Link>
                <Link href="/reports" className="inline-flex min-h-[44px] items-center justify-between rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-surface">
                  <span>Laporan laba rugi &amp; neraca</span><span aria-hidden>→</span>
                </Link>
                <Link href="/reports/export" className="inline-flex min-h-[44px] items-center justify-between rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-surface">
                  <span>{tr("Unduh laporan keuangan")}</span><span aria-hidden>→</span>
                </Link>
              </div>
              {Number(fin.budget?.budget) > 0 && (
                <div className="mt-5 rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink">
                    <span>{tr("Penggunaan anggaran")}</span>
                    <span className="tnum">{Math.round((Number(fin.budget.actual) / Number(fin.budget.budget)) * 100)}%</span>
                  </div>
                  <p className="tnum mt-1 text-xs text-ink-2">{m(fin.budget.actual)} dari {m(fin.budget.budget)}</p>
                  <div className="mt-2 h-2.5 rounded-full bg-line">
                    <div
                      className={`h-2.5 rounded-full ${Number(fin.budget.actual) > Number(fin.budget.budget) ? "bg-[var(--color-danger)]" : "bg-[var(--color-action)]"}`}
                      style={{ width: `${Math.min(100, (Number(fin.budget.actual) / Number(fin.budget.budget)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card title={tr("Transaksi keuangan terbaru")} desc="8 entri transaksi kas/bank terakhir">
            {txApi.loading ? (
              <Loading />
            ) : (
              <DataTable
                rows={txApi.data?.items ?? []}
                columns={[
                  { key: "txDate", label: tr("Tanggal"), render: (r: any) => <span className="text-xs text-ink-2">{fmtDateTime(r.txDate ?? r.createdAt)}</span> },
                  { key: "type", label: tr("Jenis"), render: (r: any) => <Badge status={r.type} /> },
                  { key: "description", label: tr("Keterangan"), render: (r: any) => r.description || "—" },
                  { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status} /> },
                  { key: "amount", label: tr("Nominal"), right: true, render: (r: any) => <span className="tnum font-semibold">{m(r.amount)}</span> },
                ]}
              />
            )}
          </Card>
        </div>
      )}

      <QuickTx
        open={qt}
        onClose={() => setQt(false)}
        onDone={() => {
          reload();
          accountsApi.reload();
          txApi.reload();
        }}
      />
    </>
  );
}
