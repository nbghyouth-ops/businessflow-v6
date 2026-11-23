"use client";
 
import { tr } from "@/lib/tr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AttachmentsPanel } from "@/components/attachments";
import { ResourcePage } from "@/components/resource-page";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Kpi, Loading, PageHeader, SelectField, Tabs } from "@/components/ui";
import { api, fmtDate, fmtDateTime, toast, useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const biz = useBiz();
  const { data, error, loading, reload } = useApi<any>(`/crm/clients/${id}`);
  const [tab, setTab] = useState("profile");
  const [status, setStatus] = useState("");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const c = data.client; const m = (v: string) => formatMoney(v, biz.currency);
  const tabs = [["profile", "Profil"], ["contacts", "Kontak"], ["activities", "Aktivitas & Catatan"], ["invoices", "Faktur & Pembayaran"], ["bookings", "Booking"], ["projects", "Proyek"], ["docs", "Dokumen"], ...(biz.can("audit:read") ? [["audit", "Audit"]] : []), ["privacy", "Privasi & Siklus Data"]].map(([key, label]) => ({ key, label }));

  async function lifecycle() {
    try { await api(`/r/clients/${id}`, { method: "PATCH", body: { status } }); toast(tr("Status diperbarui")); reload(); } catch (e) { toast((e as Error).message, "err"); }
  }
  return (
    <>
      <PageHeader label={tr("CRM / Klien")} title={c.name} desc={`${c.code} · ${c.type === "organization" ? "Organisasi" : "Perorangan"}`} actions={<div className="flex flex-wrap items-center gap-3"><Link href={`/reports/export?clientId=${id}`} className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-primary-bg">{tr("Unduh Ringkasan Klien")}</Link><Link href="/crm" className="text-sm font-semibold text-primary-deep">← Direktori</Link></div>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi label={tr("Total ditagih")} value={m(data.financial.billed)} /><Kpi label={tr("Total dibayar")} value={m(data.financial.paid)} /><Kpi label={tr("Piutang")} value={m(data.financial.outstanding)} tone={Number(data.financial.outstanding) > 0 ? "bad" : undefined} />
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "profile" && (
        <Card title={tr("Profil")}><dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {[["Nama badan hukum", c.legalName], ["Telepon", c.phone], ["Email", c.email], ["Industri", c.industry], ["Sumber", c.source], ["Status", c.status], ["Aktivitas terakhir", c.lastActivityAt && fmtDateTime(c.lastActivityAt)], ["Alamat", c.address], ["Catatan", c.notes]].map(([k, v]) => <div key={k as string}><dt className="text-xs text-ink-2">{k}</dt><dd className="font-medium">{(v as string) || "—"}</dd></div>)}
        </dl>{biz.can("crm:write") && <p className="mt-4 text-xs text-ink-2">{tr("Ubah data profil lewat Direktori Klien → Ubah.")}</p>}</Card>)}
      {tab === "contacts" && <ResourcePage resource="client-contacts" fixed={{ clientId: id }} hint={tr("Satu organisasi dapat memiliki banyak kontak.")} />}
      {tab === "activities" && <ResourcePage resource="client-activities" fixed={{ clientId: id }} hint={tr("Catatan internal hanya terlihat oleh perangkat dengan izin tulis CRM.")} />}
      {tab === "invoices" && (
        <div className="grid gap-4">
          <Card title={tr("Faktur")}><DataTable rows={data.invoices} caption={tr("Faktur klien")} empty={<Empty title={tr("Belum ada faktur")} />} columns={[{ key: "number", label: tr("No.") }, { key: "issuedAt", label: tr("Tanggal"), render: (i: any) => fmtDate(i.issuedAt) }, { key: "total", label: tr("Total"), right: true, render: (i: any) => m(i.total) }, { key: "paid", label: tr("Dibayar"), right: true, render: (i: any) => m(i.paid) }, { key: "status", label: tr("Status"), render: (i: any) => <Badge status={i.status} /> }]} /></Card>
          <Card title={tr("Pembayaran")}><DataTable rows={data.payments} caption={tr("Pembayaran klien")} empty={<Empty title={tr("Belum ada pembayaran")} />} columns={[{ key: "paidAt", label: tr("Tanggal"), render: (p: any) => fmtDateTime(p.paidAt) }, { key: "number", label: tr("Faktur") }, { key: "accountName", label: tr("Akun") }, { key: "amount", label: tr("Nominal"), right: true, render: (p: any) => m(p.amount) }, { key: "reversed", label: "", render: (p: any) => p.reversed ? <Badge tone="bad">dibalik</Badge> : null }]} /></Card>
        </div>)}
      {tab === "bookings" && <Card title={tr("Booking")}><DataTable rows={data.bookings} caption={tr("Booking klien")} empty={<Empty title={tr("Belum ada booking")} />} columns={[{ key: "startsAt", label: tr("Mulai"), render: (b: any) => fmtDateTime(b.startsAt) }, { key: "service", label: tr("Layanan") }, { key: "status", label: tr("Status"), render: (b: any) => <Badge status={b.status} /> }]} /></Card>}
      {tab === "projects" && <Card title={tr("Proyek")}><DataTable rows={data.projects} caption={tr("Proyek klien")} empty={<Empty title={tr("Belum ada proyek")} />} columns={[{ key: "name", label: tr("Proyek") }, { key: "status", label: tr("Status"), render: (p: any) => <Badge status={p.status} /> }, { key: "progress", label: tr("Progres"), right: true, render: (p: any) => `${p.progress}%` }]} /></Card>}
      {tab === "docs" && <AttachmentsPanel entityType="client" entityId={id} title={tr("Dokumen Klien")} canWrite={biz.can("crm:write")} />}
      {tab === "audit" && <Card title={tr("Riwayat Audit")}><DataTable rows={data.audit} caption={tr("Audit klien")} empty={<Empty title={tr("Belum ada riwayat")} />} columns={[{ key: "createdAt", label: tr("Waktu"), render: (a: any) => fmtDateTime(a.createdAt) }, { key: "action", label: tr("Aksi") }, { key: "operator", label: tr("Operator (pilihan perangkat)"), render: (a: any) => a.operator ?? "—" }]} /></Card>}
      {tab === "privacy" && (
        <Card title={tr("Privasi & Siklus Data")} desc={tr("Penghapusan tidak boleh merusak jurnal, faktur, dan transaksi historis; gunakan arsip/pembatasan.")}>
          {biz.can("crm:write") ? (
            <div className="grid max-w-md gap-3"><SelectField label={tr("Status data klien")} value={status || c.status} onChange={setStatus} options={[{ value: "active", label: tr("Aktif") }, { value: "inactive", label: tr("Tidak aktif") }, { value: "restricted", label: tr("Dibatasi (pemrosesan dibatasi)") }, { value: "archived", label: tr("Diarsipkan") }, { value: "pending_deletion", label: tr("Menunggu penghapusan (permintaan subjek data)") }]} /><div><Button onClick={lifecycle} disabled={!status || status === c.status}>{tr("Simpan status")}</Button></div></div>
          ) : <p className="text-sm">{tr("Status:")} <Badge status={c.status} /></p>}
          <p className="mt-4 text-xs text-ink-2">Pencatatan permintaan subjek data lengkap (consent, withdrawal) belum tersedia sebagai modul tersendiri; gunakan catatan internal dan status di atas, lalu konsultasikan kewajiban UU PDP dengan penasihat hukum.</p>
        </Card>)}
    </>
  );
}
