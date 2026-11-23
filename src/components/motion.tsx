"use client";
import { tr } from "@/lib/tr";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scroll-reveal: IntersectionObserver SEKALI per elemen. Tanpa IntersectionObserver / dengan prefers-reduced-motion
 * konten langsung tampil. Hanya dipakai untuk pengantar section/kartu terpilih, bukan baris tabel besar.
 */
export function Reveal({ children, className = "", delayMs = 0 }: { children: ReactNode; className?: string; delayMs?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!el || reduce || typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -24px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined} className={`reveal ${visible ? "reveal-in" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** true setelah halaman di-scroll melewati ambang (untuk bayangan topbar). Satu listener pasif, dibatasi rAF. */
export function useScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrolled(window.scrollY > threshold));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [threshold]);
  return scrolled;
}

/** Bar progres baca untuk halaman panjang; memakai transform saja (tanpa layout). */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      ref.current?.style.setProperty("--p", h > 0 ? String(Math.min(1, window.scrollY / h)) : "0");
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} className="scroll-progress" aria-hidden />;
}

/** Skeleton sederhana (role status tersembunyi untuk pembaca layar; berhenti saat dilepas). */
export function Skeleton({ className = "", lines = 1 }: { className?: string; lines?: number }) {
  return (
    <div role="status" aria-label={tr("Memuat")} className="grid gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`skeleton h-4 ${i === lines - 1 && lines > 1 ? "w-2/3" : "w-full"} ${className}`} />
      ))}
    </div>
  );
}
