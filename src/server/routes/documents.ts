/**
 * Rute DOKUMEN BERNOMOR (faktur/penawaran/kuitansi/surat jalan) + PDF server.
 * Semua mutasi: Zod + izin + audit + no-store. PDF dihasilkan di server (tanpa layanan luar).
 */
import { z } from "zod";
import { HttpError, r, type Route } from "../core";
import {
  DOC_KINDS,
  createDocument,
  documentPdf,
  getDocument,
  listDocuments,
  replaceDocument,
  resolveTemplate,
  saveTemplate,
  voidDocument,
} from "../documents";
import type { DocKind } from "@/features/documents/render";

const uuid = z.string().uuid();
const kindEnum = z.enum(["invoice", "quotation", "receipt", "delivery_note"]);

function safeFilename(number: string, ext = "pdf"): string {
  return `${number.replace(/[^A-Za-z0-9._-]/g, "_")}.${ext}`;
}

export const documentRoutes: Route[] = [
  /* ── Daftar templat per jenis (diletakkan SEBELUM /:id agar cocok lebih dulu) ── */
  r("GET", "/v6/documents/templates", { perm: "sales:read" }, async ({ ctx, tx }) => {
    const items = [];
    for (const kind of DOC_KINDS) {
      const res = await resolveTemplate(tx, ctx.workspaceId, kind);
      items.push({ kind, key: res.key, version: res.version, config: res.template });
    }
    return { items };
  }),

  r("PATCH", "/v6/documents/templates/:kind", { perm: "sales:write" }, async ({ ctx, tx, params, json }) => {
    const kind = kindEnum.safeParse(params.kind);
    if (!kind.success) throw new HttpError(404, "Jenis dokumen tidak dikenal.", "not_found");
    const b = await json(
      z.object({
        key: z.string().min(1).max(40).default("standard"),
        footer: z.string().max(400).optional(),
        note: z.string().max(400).nullable().optional(),
        paper: z.enum(["a4", "a5"]).optional(),
        showPrices: z.boolean().optional(),
      }),
    );
    return saveTemplate(tx, ctx, kind.data as DocKind, b.key, {
      footer: b.footer,
      note: b.note ?? undefined,
      paper: b.paper,
      showPrices: b.showPrices,
    });
  }),

  /* ── Daftar dokumen ── */
  r("GET", "/v6/documents", { perm: "sales:read" }, async ({ ctx, tx, query }) => {
    const raw = query.get("kind");
    const kind = raw && DOC_KINDS.includes(raw as DocKind) ? (raw as DocKind) : undefined;
    return listDocuments(tx, ctx, kind);
  }),

  /* ── Terbitkan dokumen dari sumber ── */
  r("POST", "/v6/documents", { perm: "sales:write" }, async ({ ctx, tx, json, idemKey }) => {
    const b = await json(z.object({ kind: kindEnum, sourceId: uuid }));
    const result = await createDocument(tx, ctx, b.kind as DocKind, b.sourceId);
    return { id: result.id, number: result.number, issuedAt: result.issuedAt, idemKey: idemKey ?? null };
  }),

  /* ── Unduh PDF (pratinjau = PDF yang sama) ── */
  r("GET", "/v6/documents/:id/pdf", { perm: "sales:read" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Dokumen tidak ditemukan.", "not_found");
    const { number, bytes } = await documentPdf(tx, ctx, params.id);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFilename(number)}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  }),

  /* ── Detail dokumen ── */
  r("GET", "/v6/documents/:id", { perm: "sales:read" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Dokumen tidak ditemukan.", "not_found");
    return { document: await getDocument(tx, ctx, params.id) };
  }),

  /* ── Batalkan dokumen (immutable; koreksi lewat pengganti) ── */
  r("POST", "/v6/documents/:id/void", { perm: "sales:write" }, async ({ ctx, tx, params, json }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Dokumen tidak ditemukan.", "not_found");
    const b = await json(z.object({ reason: z.string().min(3).max(200) }));
    return voidDocument(tx, ctx, params.id, b.reason);
  }),

  /* ── Ganti dokumen (void bertanda + dokumen pengganti bernomor baru) ── */
  r("POST", "/v6/documents/:id/replace", { perm: "sales:write" }, async ({ ctx, tx, params, json }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Dokumen tidak ditemukan.", "not_found");
    const b = await json(z.object({ reason: z.string().min(3).max(200) }));
    const result = await replaceDocument(tx, ctx, params.id, b.reason);
    return { id: result.id, number: result.number };
  }),
];
