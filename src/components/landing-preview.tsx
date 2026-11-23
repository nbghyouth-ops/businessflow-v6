"use client";

import { tr } from "@/lib/tr";
import { useState } from "react";
import { Button, Modal } from "./ui";

const STATUS_LABELS = {
  bisnis: ["Tercatat", "Rapi", "Aman"],
  pribadi: ["Aktif", "Otomatis", "Tercapai"],
} as const;
const STATUS_TITLES = ["Kas & rekening", "Stok & penjualan", "Laporan"];

/**
 * Pratinjau ilustratif untuk halaman awal (D2 §5.3).
 * Angka di bawah adalah ILUSTRASI dan diberi label eksplisit; bukan data pengguna.
 */
export function LandingPreview() {
  const [tab, setTab] = useState<"bisnis" | "pribadi">("bisnis");
  const [open, setOpen] = useState(false);
  const values = STATUS_LABELS[tab];

  return (
    <div className="relative">
      <div className="arch arch-sm relative overflow-hidden px-5 pb-6 pt-8 sm:arch sm:px-7 sm:pb-8 sm:pt-10">
        <div
          role="tablist"
          aria-label={tr("Jenis pratinjau")}
          className="mx-auto flex w-fit max-w-full gap-1 rounded-full bg-white/70 p-1"
        >
          {([
            ["bisnis", "Arus Kas Bisnis"],
            ["pribadi", "Keuangan Pribadi"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors sm:text-xs ${
                tab === key ? "bg-[var(--color-action)] text-white" : "text-[var(--color-on-accent)] hover:bg-white/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <ul className="mx-auto mt-5 grid max-w-[340px] grid-cols-3 gap-2 text-center">
          {values.map((v, i) => (
            <li key={STATUS_TITLES[i]} className="rounded-xl bg-white/45 px-1.5 py-2">
              <p className="truncate text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-on-accent)]">{STATUS_TITLES[i]}</p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-ink">{v}</p>
            </li>
          ))}
        </ul>

        <div className="pointer-events-none mx-auto my-4 grid max-w-[300px] gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="block border-t border-dashed border-white/80" />
          ))}
        </div>

        <div className="mx-auto max-w-[320px] rounded-[20px] bg-white p-4 shadow-float">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-2">{tr("Total kas & bank")}</p>
              <p className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-ink">{tr("Rp 148.500.000")}</p>
            </div>
            <span className="rounded-full bg-[var(--color-success-bg)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--color-success-text)]">+4,2%</span>
          </div>
          <div className="mt-3 flex h-12 items-end gap-1.5" aria-hidden>
            {[38, 55, 34, 68, 47, 78, 60].map((h, i) => (
              <span key={i} className="flex-1 rounded-full bg-[var(--color-accent-soft)]" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl bg-surface px-2.5 py-1.5">
              <p className="text-ink-2">{tr("Pemasukan")}</p>
              <p className="font-semibold text-ink">{tr("Rp 92.400.000")}</p>
            </div>
            <div className="rounded-xl bg-surface px-2.5 py-1.5">
              <p className="text-ink-2">{tr("Pengeluaran")}</p>
              <p className="font-semibold text-ink">{tr("Rp 41.100.000")}</p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)} className="mt-3 w-full" variant="secondary">
            Preview Dashboard
          </Button>
          <p className="mt-2 text-center text-[10px] text-ink-2">{tr("Ilustrasi tampilan, bukan data Anda.")}</p>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={tr("Pratinjau dashboard")} wide>
        <p className="text-sm leading-relaxed text-ink-2">
          Dashboard Business Flow menampilkan total kas &amp; bank, pemasukan/pengeluaran periode, transaksi terbaru,
          peringatan stok, dan KPI operasional. Semua angka dihitung dari jurnal dan transaksi yang Anda catat sendiri.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {["Ringkasan keuangan", "Penjualan & stok", "Laporan & ekspor"].map((t) => (
            <div key={t} className="rounded-2xl bg-surface p-3 text-sm font-semibold text-ink">{t}</div>
          ))}
        </div>
        <p className="mt-4 rounded-2xl bg-[var(--color-primary-bg)] p-3 text-xs leading-relaxed text-[var(--color-on-accent)]">
          Pratinjau ini ilustratif. Setelah masuk, dashboard hanya menampilkan data workspace Anda.
        </p>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setOpen(false)}>{tr("Mengerti")}</Button>
        </div>
      </Modal>
    </div>
  );
}
