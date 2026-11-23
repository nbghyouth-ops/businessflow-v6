"use client";

import { useState } from "react";
import { Button, Card, ErrorBox, Loading, PageHeader, TextField } from "@/components/ui";
import { api, toast, useApi } from "@/lib/client";
import { tr } from "@/lib/tr";

type Rules = {
  forecastDefaultWeeks: number;
  lowStockThreshold: string;
  invoiceDueDays: number;
  updatedAt: string | null;
};

/**
 * Pusat Aturan workspace (R11-E).
 *
 * Aturan di sini BENAR-BENAR dipakai: `forecastDefaultWeeks` menentukan horizon bawaan
 * Prakiraan Kas ketika pengguna tidak memilih jumlah minggu. Tidak ada aturan dekoratif.
 */
export default function RulesPage() {
  const { data, error, loading, reload } = useApi<Rules>("/v6/settings/rules");
  return (
    <>
      <PageHeader
        label={tr("Pengaturan")}
        title={tr("Pusat Aturan")}
        desc={tr("Ambang dan horizon yang dipakai modul lain. Perubahan berlaku untuk workspace ini dan tercatat di audit.")}
      />
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data ? (
        // Kunci form mengikuti versi data tersimpan: nilai awal berasal dari server tanpa setState di effect.
        <RulesForm key={data.updatedAt ?? "defaults"} initial={data} onSaved={reload} />
      ) : null}
    </>
  );
}

function RulesForm({ initial, onSaved }: { initial: Rules; onSaved: () => void }) {
  const [weeks, setWeeks] = useState(String(initial.forecastDefaultWeeks));
  const [lowStock, setLowStock] = useState(String(initial.lowStockThreshold));
  const [dueDays, setDueDays] = useState(String(initial.invoiceDueDays));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api("/v6/settings/rules", {
        method: "PATCH",
        body: {
          forecastDefaultWeeks: Number(weeks),
          lowStockThreshold: lowStock,
          invoiceDueDays: Number(dueDays),
        },
      });
      toast(tr("Aturan disimpan"));
      onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={tr("Aturan operasional")} desc={tr("Nilai di bawah dipakai nyata oleh modul terkait, bukan sekadar catatan.")}>
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <TextField
          label={tr("Horizon bawaan Prakiraan Kas (minggu)")}
          value={weeks}
          onChange={setWeeks}
          help={tr("Dipakai /forecast bila pengguna tidak memilih jumlah minggu (1–52).")}
        />
        <TextField
          label={tr("Ambang stok rendah")}
          value={lowStock}
          onChange={setLowStock}
          help={tr("Ambang yang dipakai layar produk untuk menandai stok rendah.")}
        />
        <TextField
          label={tr("Jatuh tempo invoice bawaan (hari)")}
          value={dueDays}
          onChange={setDueDays}
          help={tr("Dipakai saat membuat invoice baru (1–365 hari).")}
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button loading={busy} onClick={() => void save()}>
          {tr("Simpan aturan")}
        </Button>
        <span className="text-xs text-ink-2">
          {initial.updatedAt ? `${tr("Terakhir diubah")}: ${initial.updatedAt}` : tr("Belum pernah diubah (nilai bawaan)")}
        </span>
      </div>
    </Card>
  );
}
