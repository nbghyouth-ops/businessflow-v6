"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/client";
import { hardNavigate } from "@/lib/nav";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

export async function signOut() {
  try {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  } finally {
    hardNavigate("/sign-in"); // sesi aplikasi dicabut; akun Google di browser tidak ikut keluar
  }
}

/** Menu akun: identitas Google (tanpa token), workspace, pengaturan keamanan, keluar. Terpisah dari kunci perangkat/PIN. */
export function AccountMenu({ currentWorkspaceName }: { currentWorkspaceName?: string }) {
  const [open, setOpen] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const { data } = useApi<any>("/account/me");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const user = data?.user as { name: string; email: string; image: string | null } | undefined;
  if (!user) return null; // workspace lama (device-only) belum punya akun: menu muncul setelah diklaim
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${initials(user.name)} — menu akun ${user.name}`}
        onClick={() => setOpen((v) => !v)}
        className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border border-line bg-primary-bg text-sm font-bold text-primary-deep"
      >
        {user.image && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" width={44} height={44} referrerPolicy="no-referrer" onError={() => setImgOk(false)} className="h-full w-full object-cover" />
        ) : initials(user.name)}
      </button>
      {open && (
        <div role="menu" className="anim-drop-in absolute right-0 top-12 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-[20px] border border-line bg-white p-2 shadow-pop">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-bold text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-2">{user.email} · terverifikasi Google</p>
            {currentWorkspaceName && <p className="mt-1 truncate text-xs text-ink-2">Workspace: {currentWorkspaceName}</p>}
          </div>
          <div className="my-1 border-t border-divider" />
          <Link role="menuitem" href="/settings/security" onClick={() => setOpen(false)} className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-ink hover:bg-surface">
            Akun, anggota &amp; keamanan
          </Link>
          <button role="menuitem" type="button" onClick={signOut} className="flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]">
            Keluar
          </button>
        </div>
      )}
    </div>
  );
}
