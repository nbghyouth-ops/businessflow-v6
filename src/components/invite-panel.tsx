"use client";
import { tr } from "@/lib/tr";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "./ui";

export function InvitePanel({ signedIn, email, configured }: { signedIn: boolean; email: string | null; configured: boolean }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    // Token berada di fragmen URL (tidak dikirim ke server saat membuka halaman, tidak tersimpan di storage).
    const h = window.location.hash.replace(/^#/, "");
    if (!h) return;
    history.replaceState(null, "", "/invite");
    const t = setTimeout(() => setToken(h), 0);
    return () => clearTimeout(t);
  }, []);

  async function accept() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/invitations/accept", { body: { token: token.trim() } });
      setMsg({ tone: "ok", text: "Undangan diterima. Anda kini anggota workspace. Hubungkan perangkat ini lewat Pairing oleh pemilik, lalu buka aplikasi." });
      setToken("");
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!configured) return <p role="status" className="mt-4 text-sm text-ink-2">{tr("Login Google belum dikonfigurasi di server ini.")}</p>;
  if (!signedIn) {
    return (
      <div className="mt-4 grid gap-4">
        <p className="text-sm text-ink-2">{tr("Masuk dengan Google terlebih dahulu. Setelah masuk, buka kembali tautan undangan Anda.")}</p>
        <Link href="/sign-in?next=/invite" className="pressable inline-flex min-h-[48px] items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-white">{tr("Masuk dengan Google")}</Link>
      </div>
    );
  }
  return (
    <div className="mt-4 grid gap-4">
      <p className="text-sm text-ink-2">{tr("Anda masuk sebagai")} <strong>{email}</strong>. Undangan hanya berlaku untuk akun yang menerimanya secara sadar; kecocokan email tidak memberi akses otomatis.</p>
      <label className="grid gap-1.5 text-sm font-medium text-ink">
        Kode undangan
        <input className="field-input" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <Button loading={busy} disabled={token.trim().length < 40} onClick={accept}>{tr("Terima undangan")}</Button>
      <div aria-live="polite">{msg && <p role={msg.tone === "err" ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${msg.tone === "err" ? "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]" : "bg-[var(--color-success-bg-alt)] text-[var(--color-success-deep)]"}`}>{msg.text}</p>}</div>
    </div>
  );
}
