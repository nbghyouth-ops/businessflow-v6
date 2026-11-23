import { tr } from "@/lib/tr";

export default function AppLoading() {
  return (
    <div className="p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <div className="skeleton h-4 w-28" />
      <div className="skeleton mt-3 h-8 w-64 max-w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-3 h-7 w-32" />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-card">
        <div className="skeleton h-4 w-40" />
        <div className="mt-4 space-y-3">
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-2/3" />
        </div>
      </div>
      <span className="sr-only">{tr("Memuat data")}</span>
    </div>
  );
}
