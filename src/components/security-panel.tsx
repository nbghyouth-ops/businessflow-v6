"use client";
import { tr } from "@/lib/tr";
import Link from "next/link";
import { useState } from "react";
import { api, toast, useApi } from "@/lib/client";
import { hardNavigate } from "@/lib/nav";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, Loading, SelectField, Modal } from "./ui";
import { useBiz } from "./shell";
import { signOut } from "./account-menu";

const ROLES = [
  { value: "manager", label: tr("Manager") },
  { value: "cashier", label: tr("Kasir") },
  { value: "staff", label: tr("Staf") },
  { value: "viewer", label: tr("Hanya lihat") },
];

export function SecurityPanel() {
  const biz = useBiz();
  const me = useApi<any>("/account/me");
  if (me.loading && !me.data) return <Loading />;
  if (me.error || !me.data) {
    return (
      <Card title={tr("Hubungkan akun Google")} desc={tr("Workspace ini masih memakai kunci perangkat saja.")}>
        <p className="text-sm text-ink-2">
          Masuk dengan Google lalu klaim workspace ini agar data terikat ke akun Anda dan dapat dibuka dari perangkat mana pun. Klaim membutuhkan perangkat ini sebagai pemilik dengan PIN terbuka.
        </p>
        <div className="mt-4"><Link href="/sign-in?next=/settings/security" className="pressable inline-flex min-h-[44px] items-center rounded-full bg-primary px-5 text-sm font-semibold text-white">{tr("Masuk dengan Google")}</Link></div>
      </Card>
    );
  }
  return (
    <div className="grid gap-5">
      <ClaimCard me={me.data} reload={me.reload} />
      <AccountCard me={me.data} />
      <SessionsCard />
      {biz.can("settings:read") && <MembersCard canManage={biz.can("members:manage")} />}
      <Card title={tr("Perangkat")} desc={tr("Perangkat terdaftar dan PIN dikelola terpisah dari akun.")}>
        <Link href="/devices" className="pressable inline-flex min-h-[44px] items-center rounded-full border border-line bg-white px-5 text-sm font-semibold text-ink">Kelola perangkat &amp; PIN</Link>
      </Card>
    </div>
  );
}

function ClaimCard({ me, reload }: { me: any; reload: () => void }) {
  const biz = useBiz();
  const [busy, setBusy] = useState(false);
  const claimed = (me.workspaces ?? []).some((w: any) => w.name === biz.business.name);
  if (claimed || biz.role !== "owner") return null;
  async function claim() {
    setBusy(true);
    try {
      await api("/workspace/claim", { body: {} });
      toast(tr("Workspace berhasil ditautkan ke akun Google Anda"));
      window.location.reload();
    } catch (e) {
      toast((e as Error).message, "err");
      setBusy(false);
      reload();
    }
  }
  return (
    <Card title={tr("Klaim workspace ini")} desc={tr("Workspace lama belum terikat ke akun.")}>
      <p className="text-sm text-ink-2">{tr("Dengan mengklaim, akun Google ini menjadi owner dan seluruh akses berikutnya wajib login Google. Tindakan ini dicatat di log keamanan.")}</p>
      <div className="mt-4"><Button loading={busy} onClick={claim}>{tr("Klaim sebagai owner")}</Button></div>
    </Card>
  );
}

function AccountCard({ me }: { me: any }) {
  return (
    <Card title={tr("Akun Google")} desc={tr("Identitas diverifikasi oleh Google. Kami tidak menyimpan token Google (diuji).")}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs uppercase tracking-wide text-ink-2">Nama</dt><dd className="font-semibold text-ink">{me.user.name}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-ink-2">{tr("Email")}</dt><dd className="break-all font-semibold text-ink">{me.user.email} <Badge tone="ok">{tr("Terverifikasi")}</Badge></dd></div>
        <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wide text-ink-2">{tr("Workspace Anda")}</dt>
          <dd className="mt-1 flex flex-wrap gap-2">{(me.workspaces ?? []).map((w: any) => <Badge key={w.workspaceId}>{w.name} · {w.role}</Badge>)}</dd></div>
      </dl>
      <div className="mt-4"><Button variant="secondary" onClick={signOut}>{tr("Keluar dari akun ini")}</Button></div>
    </Card>
  );
}

function SessionsCard() {
  const { data, error, loading, reload } = useApi<any>("/account/sessions");
  const [busy, setBusy] = useState<string | null>(null);
  async function revoke(body: { sessionId?: string; all?: boolean }) {
    setBusy(body.sessionId ?? "all");
    try {
      await api("/account/sessions/revoke", { body });
      toast(body.all ? "Semua sesi dicabut" : "Sesi dicabut");
      if (body.all) hardNavigate("/sign-in"); else reload();
    } catch (e) {
      const msg = (e as Error).message;
      toast(msg.includes("Masuk ulang") ? "Untuk mencabut semua sesi, masuk ulang dengan Google terlebih dahulu (keluar lalu masuk kembali)." : msg, "err");
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card title={tr("Sesi aktif")} desc={tr("Perangkat/browser yang sedang masuk ke akun Anda.")}
      actions={<Button variant="secondary" loading={busy === "all"} onClick={() => revoke({ all: true })}>{tr("Cabut semua sesi")}</Button>}>
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <DataTable
          rows={data?.sessions ?? []}
          caption={tr("Sesi aktif")}
          empty={<Empty title={tr("Tidak ada sesi")} />}
          columns={[
            { key: "userAgent", label: tr("Browser"), render: (r: any) => <span className="line-clamp-1 max-w-[16rem]">{r.userAgent ?? "Tidak diketahui"}{r.current ? " (ini)" : ""}</span> },
            { key: "ip", label: "IP", render: (r: any) => r.ip ?? "-" },
            { key: "createdAt", label: tr("Masuk"), render: (r: any) => new Date(r.createdAt).toLocaleString("id-ID") },
            { key: "id", label: "", render: (r: any) => r.current ? null : <Button variant="secondary" loading={busy === r.id} onClick={() => revoke({ sessionId: r.id })}>{tr("Cabut")}</Button> },
          ]}
        />
      )}
    </Card>
  );
}

function MembersCard({ canManage }: { canManage: boolean }) {
  const { data, error, loading, reload } = useApi<any>("/workspace/members");
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("staff");
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite() {
    setBusy(true);
    try {
      const r = await api("/workspace/invitations", { body: { role } });
      setLink(`${window.location.origin}/invite#${r.token}`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }
  async function patch(userId: string, body: Record<string, string>) {
    try {
      await api(`/workspace/members/${userId}`, { method: "PATCH", body });
      toast(tr("Anggota diperbarui"));
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }
  return (
    <Card title={tr("Anggota & undangan")} desc={tr("Akun Google yang dapat mengakses workspace ini.")}
      actions={canManage ? <Button onClick={() => { setLink(null); setOpen(true); }}>+ Undang anggota</Button> : undefined}>
      {error ? <ErrorBox message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <DataTable
          rows={data?.members ?? []}
          caption={tr("Anggota workspace")}
          empty={<Empty title={tr("Belum ada anggota")} />}
          columns={[
            { key: "name", label: tr("Nama"), render: (r: any) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-ink-2">{r.email}</p></div> },
            { key: "role", label: tr("Peran"), render: (r: any) => canManage && r.role !== "owner" ? (
              <select aria-label={`Peran ${r.name}`} className="field-input !min-h-[40px] !py-1" value={r.role} onChange={(e) => patch(r.userId, { role: e.target.value })}>
                {ROLES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>) : <Badge>{r.role}</Badge> },
            { key: "status", label: tr("Status"), render: (r: any) => <Badge status={r.status} /> },
            { key: "userId", label: "", render: (r: any) => canManage && r.role !== "owner" ? (
              r.status === "active"
                ? <Button variant="secondary" onClick={() => patch(r.userId, { status: "removed" })}>{tr("Hapus akses")}</Button>
                : <Button variant="secondary" onClick={() => patch(r.userId, { status: "active" })}>{tr("Aktifkan")}</Button>) : null },
          ]}
        />
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={tr("Undang anggota")}>
        <div className="grid gap-3">
          {!link ? (
            <>
              <p className="text-sm text-ink-2">{tr("Tautan berlaku 7 hari, hanya dapat dipakai sekali, dan harus diterima oleh akun Google yang sedang masuk. Undangan tidak dikirim lewat email.")}</p>
              <SelectField label={tr("Peran")} value={role} onChange={setRole} options={ROLES} />
              <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>{tr("Batal")}</Button><Button loading={busy} onClick={invite}>{tr("Buat tautan")}</Button></div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-2">{tr("Salin dan kirim sendiri. Tautan ini hanya ditampilkan sekali.")}</p>
              <input readOnly aria-label={tr("Tautan undangan")} className="field-input" value={link} onFocus={(e) => e.currentTarget.select()} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(link); toast(tr("Tautan disalin")); }}>{tr("Salin")}</Button>
                <Button onClick={() => { setOpen(false); reload(); }}>{tr("Selesai")}</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </Card>
  );
}
