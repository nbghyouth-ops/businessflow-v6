"use client";

import { tr } from "@/lib/tr";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/client";

const REASONS: Record<string, string> = {
  session: "Sesi Anda berakhir atau akses Anda berubah. Silakan masuk kembali.",
};

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="var(--color-google-red)" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="var(--color-google-blue)" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="var(--color-google-yellow)" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="var(--color-google-green)" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.3-8.3M16 4h4v4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

type EmergencyStatus = { available: boolean; reason: string };

export function SignInPanel({ configured, reason, error, next = "/" }: { configured: boolean; reason?: string; error?: string; next?: string }) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [msg, setMsg] = useState<string | null>(
    error ? "Masuk dengan Google dibatalkan atau ditolak. Silakan coba lagi." : reason ? REASONS[reason] ?? null : null,
  );

  // Status jalur darurat hanya ditanyakan bila Google aktif (satu GET ringan).
  const [emergency, setEmergency] = useState<EmergencyStatus | null>(null);
  const [pin, setPin] = useState("");
  const [emBusy, setEmBusy] = useState(false);
  const [emMsg, setEmMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    api<EmergencyStatus>("/auth/emergency/status")
      .then((s) => {
        if (active) setEmergency(s);
      })
      .catch(() => {
        if (active) setEmergency({ available: false, reason: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [configured]);

  async function start() {
    if (busyRef.current || !configured) return;
    busyRef.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "bf" },
        body: JSON.stringify({ provider: "google", callbackURL: next, errorCallbackURL: "/sign-in?error=1" }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (!res.ok || !data?.url) throw new Error("fail");
      window.location.assign(data.url); // top-level redirect ke Google
    } catch {
      busyRef.current = false;
      setBusy(false);
      setMsg("Tidak dapat memulai login Google. Periksa koneksi lalu coba lagi.");
    }
  }

  async function emergencyLogin(e: React.FormEvent) {
    e.preventDefault();
    if (emBusy) return;
    setEmBusy(true);
    setEmMsg(null);
    try {
      await api("/auth/emergency-login", { body: { pin } });
      setPin("");
      setEmMsg("Berhasil. Membuka dashboard…");
      window.location.assign(next || "/");
    } catch (err) {
      const ae = err as ApiError;
      setPin("");
      setEmMsg(ae?.message ?? "PIN tidak dapat diverifikasi.");
      setEmBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="mt-5">
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-2">{tr("Login Google belum aktif")}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
            Server ini belum dikonfigurasi untuk login Google. Anda tetap dapat menyiapkan Business Flow langsung di
            perangkat ini.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-2">
            Mode Perangkat hanya tersedia selama instalasi belum memiliki bisnis. Setelah bisnis dibuat, anggota lain
            harus diundang oleh pemilik.
          </p>
        </div>
        <Link
          href="/onboarding?mode=device"
          className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--color-action)] px-5 text-[15px] font-semibold text-white hover:bg-[var(--color-action-hover)]"
        >
          <KeyIcon />
          Lanjutkan dengan Mode Perangkat
        </Link>
        <div aria-live="assertive" className="min-h-[1.25rem]">
          {msg && <p role="alert" className="mt-3 rounded-xl bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger-text)]">{msg}</p>}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-2">
          PIN disimpan sebagai hash Argon2id di server dan tidak pernah dikirim ke pihak ketiga.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      {/* Tombol sesuai merek Google: pill hitam, lingkaran putih berisi logo G, panah kanan. */}
      <button
        type="button"
        onClick={start}
        disabled={busy}
        aria-busy={busy}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-full bg-[var(--color-action)] pl-2 pr-4 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--color-action-hover)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white">
          <GoogleG />
        </span>
        <span className="min-w-0 flex-1 text-left">{busy ? "Menghubungkan ke Google…" : "Masuk dengan Google"}</span>
        <ArrowIcon />
      </button>

      <div aria-live="assertive" className="min-h-[1.25rem]">
        {msg && <p role="alert" className="mt-3 rounded-xl bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger-text)]">{msg}</p>}
      </div>

      {emergency?.available && (
        <section aria-labelledby="emergency-title" className="mt-4 rounded-2xl border border-[var(--color-warn-bg-strong)] bg-[var(--color-warn-surface)] p-4">
          <div className="flex items-center gap-2 text-[var(--color-warn-deep)]">
            <KeyIcon />
            <h2 id="emergency-title" className="text-sm font-bold">{tr("Masuk Darurat")}</h2>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-warn-deep)]">
            Layanan Google sedang terganggu. Gunakan PIN perangkat ini untuk melanjutkan pekerjaan. Sesi darurat berlaku
            maksimal 8 jam dan hanya memberi akses operasional harian.
          </p>
          <form onSubmit={emergencyLogin} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="emergency-pin">{tr("PIN perangkat")}</label>
            <input
              id="emergency-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder={tr("PIN 4–6 angka")}
              className="field-input flex-1 bg-white"
              required
            />
            <button
              type="submit"
              disabled={emBusy || pin.length < 4}
              aria-busy={emBusy}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--color-warn-deep)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {emBusy ? "Memeriksa…" : "Masuk Darurat"}
            </button>
          </form>
          <div aria-live="assertive">
            {emMsg && <p role="alert" className="mt-3 rounded-xl bg-white p-3 text-sm text-[var(--color-warn-deep)]">{emMsg}</p>}
          </div>
        </section>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-2">
        Dengan melanjutkan, Anda menyetujui{" "}
        <Link href="/legal" className="font-semibold text-ink underline">Syarat Layanan &amp; Kebijakan Privasi</Link>.
      </p>
    </div>
  );
}
