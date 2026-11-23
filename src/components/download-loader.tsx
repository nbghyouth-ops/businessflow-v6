"use client";
import { tr } from "@/lib/tr";
import { useEffect, useState, type ReactNode } from "react";

export type DownloadState = {
  active: boolean;
  title: string;
  format: string;
  stepText: string;
  progress: number;
};

type Listener = (s: DownloadState) => void;
let state: DownloadState = { active: false, title: "", format: "", stepText: "", progress: 0 };
const listeners = new Set<Listener>();

function emit(next: DownloadState) {
  state = next;
  listeners.forEach((fn) => fn(state));
}

export async function runWithDownloadProgress<T>(
  title: string,
  format: string,
  task: (setStep: (stepText: string, progress: number) => void) => Promise<T>,
): Promise<T> {
  emit({ active: true, title, format: format.toUpperCase(), stepText: tr("Menyiapkan data..."), progress: 22 });
  try {
    
    const result = await task((stepText, progress) => {
      emit({ active: true, title, format: format.toUpperCase(), stepText, progress });
    });
    emit({ active: true, title, format: format.toUpperCase(), stepText: tr("Mengunduh berkas..."), progress: 96 });
    
    return result;
  } finally {
    emit({ active: false, title: "", format: "", stepText: "", progress: 0 });
  }
}

export function DownloadProgressProvider({ children }: { children: ReactNode }) {
  const [cur, setCur] = useState<DownloadState>(state);
  useEffect(() => {
    listeners.add(setCur);
    return () => {
      listeners.delete(setCur);
    };
  }, []);

  return (
    <>
      {children}
      {cur.active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          aria-label={tr("Mengunduh {title}").replace("{title}", cur.title)}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(17,24,39,0.55)] p-4 backdrop-blur-[2px]"
        >
          <div className="anim-modal-in w-full max-w-sm rounded-[24px] border border-line bg-white p-6 text-center shadow-pop">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-bg text-primary-deep">
              <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary-deep border-t-transparent" aria-hidden />
            </div>
            <span className="inline-block rounded-full bg-[var(--color-action-deep)] px-3 py-0.5 text-[11px] font-bold tracking-wider text-white">
              {cur.format}
            </span>
            <h2 className="mt-2.5 text-base font-bold text-ink">{cur.title}</h2>
            <p className="mt-1 text-xs font-medium text-ink-2">{cur.stepText}</p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(10, cur.progress))}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
