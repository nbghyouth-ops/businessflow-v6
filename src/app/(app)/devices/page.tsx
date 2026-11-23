"use client";
 
import { tr } from "@/lib/tr";
import { useState } from "react";
import { useConfirm } from "@/components/confirm-dialog";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, Modal, PageHeader, SelectField, Tabs, TextField } from "@/components/ui";
import { api, fmtDateTime, toast, useApi } from "@/lib/client";

const ROLE_L: Record<string, string> = { owner: "Owner", manager: "Manager", cashier: "Kasir", staff: "Staf", viewer: "Viewer (hanya lihat)" };

export default function Devices() {
  const biz = useBiz();
  const { confirm, ConfirmUI } = useConfirm();
  const [tab, setTab] = useState("devices");
  const tabs = [{ key: "devices", label: tr("Perangkat") }, { key: "me", label: tr("Perangkat ini") }, ...(biz.can("audit:read") ? [{ key: "audit", label: tr("Audit") }] : []), { key: "sec", label: tr("Keamanan & Data") }];
  return (
    <>
      <PageHeader label={tr("Configuration")} title={tr("Perangkat & Keamanan")} desc={tr("Akses diberikan kepada perangkat, bukan akun pengguna. Hak akses diverifikasi server di setiap permintaan.")} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "devices" && <DeviceList />}{tab === "me" && <Me />}{tab === "audit" && <Audit />}{tab === "sec" && <Sec />}
      {ConfirmUI}
    </>
  );
}

function DeviceList() {
  const biz = useBiz();
  const { confirm, ConfirmUI } = useConfirm();
  const { data, error, loading, reload } = useApi<any>("/devices");
  const [role, setRole] = useState("cashier"); const [pair, setPair] = useState<any>(null);
  async function gen() { try { setPair(await api("/devices/pairing", { body: { role } })); } catch (e) { toast((e as Error).message, "err"); } }
  async function revoke(d: any) { if (!(await confirm({ title: tr("Cabut Perangkat"), message: `Cabut akses "${d.name}"? Semua sesinya langsung ditolak.`, confirmLabel: "Cabut Akses" }))) return; try { await api(`/devices/${d.id}/revoke`, { body: {} }); toast(tr("Perangkat dicabut")); reload(); } catch (e) { toast((e as Error).message, "err"); } }
  async function chRole(d: any, r: string) { try { await api(`/devices/${d.id}`, { method: "PATCH", body: { role: r } }); toast(tr("Peran diubah")); reload(); } catch (e) { toast((e as Error).message, "err"); } }
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const manage = biz.can("devices:manage");
  return (
    <div className="grid gap-6">
      {manage && (
        <Card title={tr("Tambahkan perangkat")} desc={tr("Buat kode sekali pakai (berlaku 10 menit). Perangkat baru membuka website → ‘Sambungkan Perangkat’ → masukkan kode → buat PIN.")}>
          <div className="flex flex-wrap items-end gap-3"><div className="w-56"><SelectField label={tr("Peran perangkat baru")} value={role} onChange={setRole} options={["manager", "cashier", "staff", "viewer"].map((r) => ({ value: r, label: ROLE_L[r] }))} /></div><Button onClick={gen}>{tr("Buat kode pairing")}</Button></div>
        </Card>)}
      <Card title={tr("Perangkat terhubung")}>
        <DataTable rows={data.items} caption={tr("Perangkat")} empty={<Empty title={tr("Belum ada perangkat")} />} columns={[
          { key: "name", label: tr("Perangkat"), render: (d: any) => <span>{d.name}{d.id === data.self && <Badge tone="info"> ini</Badge>}{d.operatorName && <span className="block text-xs text-ink-2">Operator: {d.operatorName}</span>}</span> },
          { key: "role", label: tr("Peran"), render: (d: any) => manage && d.grantStatus === "active" ? <select aria-label={`Peran ${d.name}`} className="field-input !min-h-[34px] !w-44" value={d.role} onChange={(e) => chRole(d, e.target.value)}>{Object.entries(ROLE_L).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> : ROLE_L[d.role] },
          { key: "lastActiveAt", label: tr("Terakhir aktif"), render: (d: any) => fmtDateTime(d.lastActiveAt) }, { key: "grantStatus", label: tr("Status"), render: (d: any) => <Badge status={d.grantStatus} /> },
          { key: "a", label: "", render: (d: any) => manage && d.grantStatus === "active" ? <Button variant="danger" className="!min-h-[32px] !px-2" onClick={() => revoke(d)}>{tr("Cabut")}</Button> : null }]} />
      </Card>
      <Modal open={!!pair} onClose={() => { setPair(null); reload(); }} title={tr("Kode pairing")}>
        {pair && <div className="text-center"><p className="kpi-value select-all text-[40px] font-bold tracking-[0.2em] text-primary-deep">{pair.code}</p><p className="mt-2 text-sm text-ink-2">Berlaku sampai {fmtDateTime(pair.expiresAt)}. Hanya dapat dipakai sekali. Kode ini tidak akan ditampilkan lagi.</p><Button className="mt-4" onClick={() => { setPair(null); reload(); }}>{tr("Selesai")}</Button></div>}
      </Modal>
    </div>
  );
}

function Me() {
  const me = useApi<any>("/device/me");
  const [name, setName] = useState(""); const [op, setOp] = useState("");
  async function save() { try { await api("/device/me", { method: "PATCH", body: { ...(name && { deviceName: name }), operatorName: op } }); toast(tr("Disimpan")); me.reload(); } catch (e) { toast((e as Error).message, "err"); } }
  if (!me.data) return <Loading />;
  return (
    <Card title={tr("Perangkat ini")} desc={`Peran: ${ROLE_L[me.data.role]}. Nama operator hanya atribusi aktivitas pada audit — bukan verifikasi identitas manusia.`}>
      <div className="grid max-w-md gap-3"><TextField label={tr("Nama perangkat")} value={name || me.data.deviceName} onChange={setName} /><TextField label={tr("Operator saat ini (opsional)")} value={op || me.data.operatorName || ""} onChange={setOp} help={tr("Perangkat bersama tidak membuktikan siapa yang melakukan aksi.")} /><div><Button onClick={save}>{tr("Simpan")}</Button></div></div>
      <p className="mt-4 text-sm text-ink-2">{tr("Untuk mengubah PIN: kunci aplikasi, lalu tekan ‘Ubah PIN’ di pojok kanan bawah layar PIN.")}</p>
    </Card>
  );
}

function Audit() {
  const { data, error, loading, reload } = useApi<any>("/audit?limit=150");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  return <Card title={tr("Log Audit")} desc={tr("Mencatat perangkat, operator pilihan, aksi, dan sumber daya.")}><DataTable rows={data.items} caption={tr("Audit")} empty={<Empty title={tr("Belum ada log")} />} columns={[{ key: "createdAt", label: tr("Waktu"), render: (a: any) => fmtDateTime(a.createdAt) }, { key: "deviceName", label: tr("Perangkat"), render: (a: any) => a.deviceName ?? "—" }, { key: "operator", label: tr("Operator"), render: (a: any) => a.operator ?? "—" }, { key: "action", label: tr("Aksi") }, { key: "resource", label: tr("Sumber daya") }]} /></Card>;
}

function Sec() {
  const health = useApi<any>("/health");
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card title={tr("Status sistem")}><p className="text-sm">Koneksi database: {health.data?.ok ? <Badge status="active">terhubung</Badge> : health.error ? <Badge tone="bad">bermasalah</Badge> : "memeriksa…"}</p></Card>
      <Card title={tr("Batasan keamanan yang perlu Anda ketahui")}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>{tr("PIN adalah kunci layar ringan, bukan autentikasi manusia. Siapa pun yang menguasai perangkat tepercaya dapat mengganti PIN.")}</li>
          <li>{tr("Perlindungan utama: kredensial perangkat (cookie HttpOnly), izin per peran di server, pencabutan perangkat, dan audit.")}</li>
          <li>Jika semua perangkat Owner hilang, tidak ada reset publik; diperlukan prosedur administrator database.</li>
          <li>{tr("Pencadangan & pemulihan bergantung pada konfigurasi Neon pemilik — lihat docs/database/BACKUP_RESTORE.md. Belum diverifikasi dari aplikasi.")}</li>
          <li>{tr("Penyimpanan file privat belum aktif sampai Neon Object Storage dikonfigurasi.")}</li>
        </ul>
      </Card>
    </div>
  );
}
