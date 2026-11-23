import { tr } from "@/lib/tr";

export default function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4" aria-busy="true" aria-live="polite">
      <div className="w-full max-w-md rounded-[24px] border border-line bg-white p-8 shadow-card">
        <div className="skeleton h-8 w-8 rounded-xl" />
        <p className="mt-6 text-sm font-semibold text-ink">{tr("Memuat Business Flow…")}</p>
        <div className="mt-4 space-y-2">
          <div className="skeleton h-3 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
        </div>
        <span className="sr-only">{tr("Memuat halaman")}</span>
      </div>
    </main>
  );
}
