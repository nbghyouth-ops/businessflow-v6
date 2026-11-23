"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Lanjutkan",
  cancelLabel = "Batal",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  open: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(32,51,50,0.5)] p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="bf-confirm-title"
      aria-describedby="bf-confirm-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-pop">
        <h2 id="bf-confirm-title" className="text-lg font-bold text-ink">
          {title}
        </h2>
        <p id="bf-confirm-desc" className="mt-2 text-sm leading-relaxed text-ink-2">
          {message}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink transition-colors hover:bg-primary-bg disabled:cursor-not-allowed disabled:text-ink-2">
            {cancelLabel}
          </button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [req, setReq] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const ask = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setReq({ ...opts, resolve });
    });
  }, []);

  const handleClose = useCallback(
    (ok: boolean) => {
      setReq((cur) => {
        cur?.resolve(ok);
        return null;
      });
    },
    [],
  );

  const dialog = (
    <ConfirmDialog
      open={Boolean(req)}
      title={req?.title ?? ""}
      message={req?.message ?? ""}
      confirmLabel={req?.confirmLabel}
      cancelLabel={req?.cancelLabel}
      tone={req?.tone}
      onConfirm={() => handleClose(true)}
      onCancel={() => handleClose(false)}
    />
  );

  return { confirm: ask, ConfirmUI: dialog };
}
