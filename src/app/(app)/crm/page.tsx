"use client";
 
import { tr } from "@/lib/tr";
import Link from "next/link";
import { useState } from "react";
import { ResourcePage } from "@/components/resource-page";
import { useConfirm } from "@/components/confirm-dialog";
import { useBiz } from "@/components/shell";
import { Button, Card, Empty, ErrorBox, Loading, PageHeader, Tabs } from "@/components/ui";
import { api, toast, useApi } from "@/lib/client";

export default function Crm() {
  const biz = useBiz();
  const [tab, setTab] = useState("dir");
  return (
    <>
      <PageHeader label={tr("Business Operations")} title={tr("CRM / Pusat Data Klien")} desc={tr("Master data klien — satu sumber untuk faktur, booking, proyek, dan riwayat. Email tidak harus unik dan hanya kontak opsional.")} />
      <Tabs tabs={[{ key: "dir", label: tr("Direktori Klien") }, ...(biz.can("crm:write") ? [{ key: "dup", label: tr("Deteksi Duplikat") }] : [])]} value={tab} onChange={setTab} />
      {tab === "dir" ? <ResourcePage resource="clients" rowLink={(r) => <Link href={`/crm/${r.id}`} className="inline-flex min-h-[32px] items-center rounded-lg px-2 text-sm font-semibold text-primary-deep hover:bg-primary-bg">Buka</Link>} /> : <Duplicates />}
    </>
  );
}

function Duplicates() {
  const { confirm, ConfirmUI } = useConfirm();
  const { data, error, loading, reload } = useApi<any>("/crm/duplicates");
  async function merge(source: string, target: string) {
    if (!(await confirm({ title: tr("Gabungkan Klien"), message: tr("Gabungkan klien? Data (kontak, aktivitas, faktur, booking, proyek) dipindah ke klien tujuan, klien sumber diarsipkan, dan tercatat di audit."), confirmLabel: "Gabungkan", tone: "primary" }))) return;
    try { await api("/crm/merge", { body: { sourceId: source, targetId: target } }); toast(tr("Klien digabung")); reload(); } catch (e) { toast((e as Error).message, "err"); }
  }
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  if (!data.items.length) return <Empty title={tr("Tidak ada kemungkinan duplikat")} hint={tr("Pemeriksaan memakai nama, telepon, dan email yang dinormalisasi. Klien tidak pernah digabung otomatis.")} />;
  return (
    <div className="grid gap-4">
      {data.items.map((g: any, i: number) => (
        <Card key={i} title={`${g.reason}: ${g.key}`}>
          <ul className="grid gap-2">{g.clients.map((c: any) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{c.name} <span className="text-ink-2">({c.code}{c.phone ? ` · ${c.phone}` : ""})</span></span>
              <span className="flex gap-2"><Link href={`/crm/${c.id}`} className="font-semibold text-primary-deep">{tr("Lihat")}</Link>{g.clients.filter((x: any) => x.id !== c.id).slice(0, 1).map((t: any) => <Button key={t.id} variant="secondary" className="!min-h-[32px] !px-2" onClick={() => merge(c.id, t.id)}>Gabung ke {t.code}</Button>)}</span></li>))}</ul>
        </Card>))}
    </div>
  );
}
