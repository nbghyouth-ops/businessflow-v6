"use client";
import { tr } from "@/lib/tr";
import { useEffect, useState } from "react";
import { PageHeader, Card } from "@/components/ui";
import { api } from "@/lib/client";

type Health = {
  ok: boolean;
  reason?: string;
  checks: { database: string; schema: string; auth: string; authMode: string };
};

export default function SystemStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const h = await fetch("/api/v1/health", { cache: "no-store" }).then((r) => r.json());
      setHealth(h as Health);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Defer agar setState tidak dipanggil sinkron di body effect (aturan lint).
    const id = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <PageHeader label={tr("Status")} title={tr("Status Sistem")} desc={tr("Ringkasan kesehatan database, skema, dan konfigurasi autentikasi (tanpa menampilkan secret).")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={tr("Kesehatan layanan")}>
          {loading && <p className="text-sm text-ink-2">{tr("Memuat…")}</p>}
          {err && <p role="alert" className="text-sm text-[var(--color-danger-deep)]">{err}</p>}
          {health && (
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-2">{tr("Status")}</dt><dd className="font-semibold">{health.ok ? "OK" : health.reason ?? "DEGRADED"}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">{tr("Database")}</dt><dd>{health.checks.database}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">{tr("Skema")}</dt><dd>{health.checks.schema}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">{tr("Login tersedia")}</dt><dd>{health.checks.auth}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">{tr("Mode auth")}</dt><dd>{health.checks.authMode}</dd></div>
            </dl>
          )}
          <div className="mt-4">
            <button type="button" onClick={load} className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-primary-bg">
              Muat ulang
            </button>
          </div>
        </Card>
        <Card title={tr("Fallback")}>
          <p className="text-sm text-ink-2">
            Saklar global fallback berada di tabel <code>system_flags.fallbacks_enabled</code> (default true). Matikan/nyalakan hanya melalui
            migrasi atau alat admin; aplikasi tetap berjalan tanpa fallback bila dimatikan.
          </p>
        </Card>
      </div>
    </>
  );
}
