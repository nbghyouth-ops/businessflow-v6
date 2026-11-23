"use client";
 
import { tr } from "@/lib/tr";
import { DsrPanel } from "@/components/p2-panels";
import { Card, DataTable, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { fmtDateTime, useApi } from "@/lib/client";

export default function Legal() {
  const { data, error, loading, reload } = useApi<any>("/legal");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  return (
    <>
      <PageHeader label={tr("Configuration")} title={tr("Syarat & Privasi")} desc={tr("Dokumen yang berlaku dan riwayat persetujuan workspace (tidak diubah saat dokumen diperbarui).")} />
      <div className="grid gap-6">
        {data.documents.map((d: any) => (
          <Card key={d.kind + d.version} title={`${d.title} — versi ${d.version}`} desc={`Berlaku sejak ${fmtDateTime(d.effectiveAt)}`}>
            <div className="space-y-2 text-sm text-ink-2">{d.body.split("\n\n").map((p: string) => <p key={p}>{p}</p>)}</div>
          </Card>))}
        <DsrPanel />
        <Card title={tr("Riwayat persetujuan")}>
          <DataTable rows={data.acceptances} caption={tr("Persetujuan")} columns={[{ key: "kind", label: tr("Dokumen"), render: (a: any) => (a.kind === "terms" ? "Syarat & Ketentuan" : "Kebijakan Privasi") }, { key: "version", label: tr("Versi") }, { key: "acceptedAt", label: tr("Waktu"), render: (a: any) => fmtDateTime(a.acceptedAt) }]} />
        </Card>
        <p className="text-xs text-ink-2">{tr("Dokumen adalah templat awal dan bukan nasihat hukum. Kepatuhan UU PDP, transfer data lintas negara, dan kewajiban PSE perlu dikaji penasihat hukum.")}</p>
      </div>
    </>
  );
}
