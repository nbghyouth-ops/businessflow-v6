/**
 * Layanan DOKUMEN BERNOMOR (faktur/penawaran/kuitansi/surat jalan) — sisi server.
 *
 * Prinsip:
 * - Nomor dialokasikan di transaksi yang SAMA dengan dokumen (doc_counters) → tanpa celah:
 *   rollback mengembalikan counter, 50 pemanggil paralel tetap unik & berurutan.
 * - Dokumen IMMUTABLE setelah terbit: koreksi hanya lewat void bertanda + dokumen pengganti.
 * - Kuitansi = CATATAN pembayaran diterima di luar aplikasi (tanpa tautan/tombol bayar).
 * - Kop memakai identitas BISNIS TENANT (businesses), bukan logo aplikasi.
 */
import { sql } from "drizzle-orm";
import { HttpError, audit, getBusiness, nextNumber, type Ctx, type DB } from "./core";
import { can } from "@/lib/permissions";
import { toCents } from "@/lib/money";
import { DEFAULT_TEMPLATE, DOC_TITLE, renderDocumentPdf, type DocKind, type DocumentSnapshot, type DocumentTemplate } from "@/features/documents/render";
import type { PdfPaper } from "@/features/documents/pdf";

export const DOC_KINDS: DocKind[] = ["invoice", "quotation", "receipt", "delivery_note"];

const NUMBER_SPEC: Record<DocKind, { key: string; prefix: string }> = {
  invoice: { key: "doc_invoice", prefix: "FK" },
  quotation: { key: "doc_quotation", prefix: "PNW" },
  receipt: { key: "doc_receipt", prefix: "KW" },
  delivery_note: { key: "doc_delivery_note", prefix: "SJ" },
};

const RECORD_ONLY =
  "Business Flow adalah aplikasi pencatatan. Dokumen ini bukan bukti pembayaran: tidak ada pemrosesan pembayaran, tautan pembayaran, kode QR, akun virtual, transfer, atau pencairan dana di dalamnya, dan tidak ada data yang diubah otomatis di luar yang Anda catat.";

/** "12.500,50" / "12500.50" (satuan mayor) → sen (BigInt). Aman untuk nilai apa pun. */
function centsOf(value: unknown): bigint {
  const s = String(value ?? "0").trim();
  if (!s) return 0n;
  const neg = s.startsWith("-");
  const clean = neg ? s.slice(1) : s;
  const c = /^\d{1,15}(\.\d{1,2})?$/.test(clean) ? toCents(clean) : 0n;
  return neg ? -c : c;
}

/** Satuan minor yang sudah tersimpan sebagai BIGINT (mis. tabel quotations) → sen. */
function rawCents(value: unknown): bigint {
  const s = String(value ?? "0").trim();
  if (!/^-?\d+$/.test(s)) return 0n;
  return BigInt(s);
}

type TemplateResolved = { template: DocumentTemplate; key: string; version: number };

/** Templat aktif per jenis (versi terbaru). Bila tenant belum punya, pakai templat bawaan (versi 1). */
export async function resolveTemplate(d: DB, workspaceId: string, kind: DocKind): Promise<TemplateResolved> {
  const res = await d.execute(sql`
    SELECT t.key, t.current_version, v.config
    FROM document_templates t
    JOIN document_template_versions v ON v.template_id = t.id AND v.version = t.current_version
    WHERE t.workspace_id = ${workspaceId} AND t.kind = ${kind}
    LIMIT 1
  `);
  const row = res.rows[0] as { key: string; current_version: number; config: Record<string, unknown> } | undefined;
  if (!row) return { template: DEFAULT_TEMPLATE[kind], key: "standard", version: 1 };
  const base = DEFAULT_TEMPLATE[kind];
  const cfg = (row.config ?? {}) as Partial<DocumentTemplate>;
  return {
    key: String(row.key),
    version: Number(row.current_version),
    template: {
      paper: (cfg.paper as PdfPaper) ?? base.paper,
      showPrices: cfg.showPrices ?? base.showPrices,
      footer: typeof cfg.footer === "string" && cfg.footer ? cfg.footer : base.footer,
      note: typeof cfg.note === "string" ? cfg.note : base.note,
    },
  };
}

type Biz = { name: string; address: string | null; description?: string | null; slogan?: string | null; currency: string; timezone: string };

async function buildInvoiceSnapshot(
  d: DB,
  ctx: Ctx,
  kind: DocKind,
  invoiceId: string,
  biz: Biz,
  number: string,
  template: DocumentTemplate,
): Promise<DocumentSnapshot> {
  const ws = ctx.workspaceId;
  const invRes = await d.execute(sql`
    SELECT i.id, i.number, i.subtotal::text AS subtotal, i.discount::text AS discount, i.tax::text AS tax,
           i.total::text AS total, i.paid::text AS paid, i.issued_at, i.due_date::text AS due_date, i.note, i.status,
           c.name AS client_name
    FROM invoices i
    LEFT JOIN clients c ON c.id = i.client_id AND c.workspace_id = i.workspace_id
    WHERE i.id = ${invoiceId} AND i.workspace_id = ${ws}
    LIMIT 1
  `);
  const inv = invRes.rows[0] as Record<string, unknown> | undefined;
  if (!inv) throw new HttpError(404, "Faktur / transaksi sumber tidak ditemukan.", "not_found");

  const linesRes = await d.execute(sql`
    SELECT l.description, l.quantity::text AS qty, l.unit_price::text AS unit_price, l.line_total::text AS line_total
    FROM invoice_lines l
    WHERE l.invoice_id = ${invoiceId} AND l.workspace_id = ${ws}
    ORDER BY l.id ASC
  `);

  const totalCents = centsOf(inv.total);
  let paidCents: bigint | null = null;
  if (kind === "receipt") {
    const payRes = await d.execute(sql`
      SELECT coalesce(sum(amount) FILTER (WHERE reversed = false), 0)::text AS paid_sum, count(*)::int AS cnt
      FROM payments WHERE invoice_id = ${invoiceId} AND workspace_id = ${ws}
    `);
    const row = payRes.rows[0] as { paid_sum?: string; cnt?: number } | undefined;
    paidCents = Number(row?.cnt ?? 0) > 0 ? centsOf(row?.paid_sum ?? "0") : centsOf(inv.paid);
    if (inv.status === "reversed") paidCents = 0n;
  }

  return {
    kind,
    number,
    title: DOC_TITLE[kind],
    businessName: biz.name,
    businessAddress: biz.address ?? "Alamat usaha belum diisi",
    businessContact: biz.slogan ?? biz.description ?? "—",
    currency: biz.currency,
    timezone: biz.timezone,
    issuedAt: new Date(String(inv.issued_at)).toISOString(),
    clientName: can(ctx.role, "crm:read") && inv.client_name ? String(inv.client_name) : null,
    reference: String(inv.number),
    dueDate: inv.due_date ? String(inv.due_date) : null,
    items: (linesRes.rows as Record<string, unknown>[]).map((l) => ({
      name: String(l.description),
      qty: String(l.qty),
      unitPriceCents: centsOf(l.unit_price).toString(),
      totalCents: centsOf(l.line_total).toString(),
    })),
    subtotalCents: centsOf(inv.subtotal).toString(),
    discountCents: centsOf(inv.discount).toString(),
    taxCents: centsOf(inv.tax).toString(),
    totalCents: totalCents.toString(),
    paidCents: paidCents === null ? null : paidCents.toString(),
    note: (kind === "receipt" ? "Pembayaran diterima di luar aplikasi." : inv.note ? String(inv.note) : null),
    footer: template.footer,
    recordOnlyNote: RECORD_ONLY,
  };
}

async function buildQuotationSnapshot(
  d: DB,
  ctx: Ctx,
  quotationId: string,
  biz: Biz,
  number: string,
  template: DocumentTemplate,
): Promise<DocumentSnapshot> {
  const ws = ctx.workspaceId;
  const qRes = await d.execute(sql`
    SELECT q.id, q.number, q.subtotal::text AS subtotal, q.discount::text AS discount, q.tax::text AS tax,
           q.total::text AS total, q.valid_until::text AS valid_until, q.notes, q.lines, c.name AS client_name
    FROM quotations q
    LEFT JOIN clients c ON c.id = q.client_id AND c.workspace_id = q.workspace_id
    WHERE q.id = ${quotationId} AND q.workspace_id = ${ws}
    LIMIT 1
  `);
  const q = qRes.rows[0] as Record<string, unknown> | undefined;
  if (!q) throw new HttpError(404, "Penawaran sumber tidak ditemukan.", "not_found");
  const rawLines = Array.isArray(q.lines) ? (q.lines as Record<string, unknown>[]) : [];
  return {
    kind: "quotation",
    number,
    title: DOC_TITLE.quotation,
    businessName: biz.name,
    businessAddress: biz.address ?? "Alamat usaha belum diisi",
    businessContact: biz.slogan ?? biz.description ?? "—",
    currency: biz.currency,
    timezone: biz.timezone,
    issuedAt: new Date().toISOString(),
    clientName: can(ctx.role, "crm:read") && q.client_name ? String(q.client_name) : null,
    reference: String(q.number),
    dueDate: q.valid_until ? String(q.valid_until) : null,
    items: rawLines.map((l) => {
      const qtyMilli = BigInt(Math.round(Number(l.qty ?? 0) * 1000));
      const unit = centsOf(l.unitPrice);
      const gross = (unit * qtyMilli) / 1000n;
      const disc = centsOf(l.discount);
      return {
        name: String(l.description ?? "—"),
        qty: `${(Number(qtyMilli) / 1000).toString()}`,
        unitPriceCents: unit.toString(),
        totalCents: (gross > disc ? gross - disc : 0n).toString(),
      };
    }),
    subtotalCents: rawCents(q.subtotal).toString(),
    discountCents: rawCents(q.discount).toString(),
    taxCents: rawCents(q.tax).toString(),
    totalCents: rawCents(q.total).toString(),
    paidCents: null,
    note: q.notes ? String(q.notes) : null,
    footer: template.footer,
    recordOnlyNote: RECORD_ONLY,
  };
}

/** Menerbitkan dokumen bernomor dari sumber (faktur/penawaran). Nomor & dokumen satu transaksi. */
export async function createDocument(
  d: DB,
  ctx: Ctx,
  kind: DocKind,
  sourceId: string,
  opts: { replacesId?: string | null } = {},
): Promise<{ id: string; number: string; issuedAt: string; snapshot: DocumentSnapshot }> {
  const biz = await getBusiness(d, ctx);
  const { template, key, version } = await resolveTemplate(d, ctx.workspaceId, kind);
  const spec = NUMBER_SPEC[kind];
  const number = await nextNumber(d, ctx.workspaceId, spec.key, spec.prefix);
  const snapshot =
    kind === "quotation"
      ? await buildQuotationSnapshot(d, ctx, sourceId, biz, number, template)
      : await buildInvoiceSnapshot(d, ctx, kind, sourceId, biz, number, template);
  const ins = await d.execute(sql`
    INSERT INTO documents
      (workspace_id, business_id, branch_id, kind, number, source_kind, source_id, template_key, template_version,
       status, snapshot, notes, issued_by_device_id, issued_by_operator, replaces_id)
    VALUES
      (${ctx.workspaceId}, ${biz.id}, ${ctx.branchId}, ${kind}, ${number},
       ${kind === "quotation" ? "quotation" : "invoice"}, ${sourceId}, ${key}, ${version},
       'issued', ${JSON.stringify(snapshot)}::jsonb, ${snapshot.note}, ${ctx.deviceId}, ${ctx.operator ?? ctx.deviceName},
       ${opts.replacesId ?? null})
    RETURNING id, number, issued_at AS "issuedAt"
  `);
  const row = ins.rows[0] as { id: string; number: string; issuedAt: string };
  await audit(d, ctx, `document.create.${kind}`, "document", row.id, { number, sourceId, replacesId: opts.replacesId ?? null });
  return { ...row, snapshot };
}

export async function listDocuments(d: DB, ctx: Ctx, kind?: DocKind) {
  const res = await d.execute(sql`
    SELECT id, kind, number, status, source_kind AS "sourceKind", source_id AS "sourceId",
           template_key AS "templateKey", template_version AS "templateVersion",
           (snapshot->>'totalCents') AS "totalCents", (snapshot->>'clientName') AS "clientName",
           (snapshot->>'currency') AS currency, issued_at AS "issuedAt", voided_at AS "voidedAt",
           voided_reason AS "voidedReason", replaces_id AS "replacesId"
    FROM documents
    WHERE workspace_id = ${ctx.workspaceId} ${kind ? sql`AND kind = ${kind}` : sql``}
    ORDER BY issued_at DESC
    LIMIT 200
  `);
  return { items: res.rows };
}

export async function getDocument(d: DB, ctx: Ctx, id: string) {
  const res = await d.execute(sql`
    SELECT id, kind, number, status, source_kind AS "sourceKind", source_id AS "sourceId",
           template_key AS "templateKey", template_version AS "templateVersion", snapshot,
           notes, issued_at AS "issuedAt", issued_by_device_id AS "issuedByDeviceId",
           issued_by_operator AS "issuedByOperator", voided_at AS "voidedAt",
           voided_reason AS "voidedReason", replaces_id AS "replacesId"
    FROM documents WHERE id = ${id} AND workspace_id = ${ctx.workspaceId} LIMIT 1
  `);
  const row = res.rows[0];
  if (!row) throw new HttpError(404, "Dokumen tidak ditemukan.", "not_found");
  return row;
}

export async function voidDocument(d: DB, ctx: Ctx, id: string, reason: string) {
  const res = await d.execute(sql`
    UPDATE documents SET status = 'voided', voided_at = now(), voided_reason = ${reason}
    WHERE id = ${id} AND workspace_id = ${ctx.workspaceId} AND status = 'issued'
    RETURNING id, number
  `);
  const row = res.rows[0] as { id: string; number: string } | undefined;
  if (!row) throw new HttpError(409, "Dokumen tidak ditemukan atau sudah dibatalkan.", "not_voidable");
  await audit(d, ctx, "document.void", "document", row.id, { number: row.number, reason });
  return row;
}

/** Dokumen pengganti: dokumen lama dibatalkan bertanda, dokumen baru dibuat dari sumber yang sama. */
export async function replaceDocument(d: DB, ctx: Ctx, id: string, reason: string) {
  const original = await getDocument(d, ctx, id);
  const kind = String(original.kind) as DocKind;
  const sourceId = original.sourceId ? String(original.sourceId) : null;
  if (!sourceId) throw new HttpError(422, "Dokumen sumber tidak dapat diganti.", "not_replaceable");
  await voidDocument(d, ctx, id, reason);
  return createDocument(d, ctx, kind, sourceId, { replacesId: id });
}

export async function documentPdf(d: DB, ctx: Ctx, id: string): Promise<{ number: string; kind: DocKind; bytes: Uint8Array }> {
  const row = await getDocument(d, ctx, id);
  const kind = String(row.kind) as DocKind;
  const snapshot = row.snapshot as DocumentSnapshot;
  const { template } = await resolveTemplate(d, ctx.workspaceId, kind);
  const bytes = renderDocumentPdf({ ...snapshot, footer: snapshot.footer || template.footer }, template);
  return { number: String(row.number), kind, bytes };
}

/** Simpan versi templat baru untuk satu jenis dokumen (dipakai UI kop/kaki dokumen). */
export async function saveTemplate(
  d: DB,
  ctx: Ctx,
  kind: DocKind,
  key: string,
  config: Partial<DocumentTemplate>,
): Promise<{ key: string; version: number }> {
  const existing = await resolveTemplate(d, ctx.workspaceId, kind);
  const nextVersion = existing.key === key ? existing.version + 1 : 1;
  const meta = await d.execute(sql`
    INSERT INTO document_templates (workspace_id, kind, key, current_version)
    VALUES (${ctx.workspaceId}, ${kind}, ${key}, ${nextVersion})
    ON CONFLICT (workspace_id, kind, key)
    DO UPDATE SET current_version = ${nextVersion}, updated_at = now()
    RETURNING id
  `);
  const templateId = String((meta.rows[0] as { id: string }).id);
  const merged: DocumentTemplate = { ...DEFAULT_TEMPLATE[kind], ...existing.template, ...config };
  await d.execute(sql`
    INSERT INTO document_template_versions (workspace_id, template_id, version, config)
    VALUES (${ctx.workspaceId}, ${templateId}, ${nextVersion}, ${JSON.stringify(merged)}::jsonb)
    ON CONFLICT (template_id, version) DO NOTHING
  `);
  await audit(d, ctx, "document.template.save", "document_template", templateId, { kind, key, version: nextVersion });
  return { key, version: nextVersion };
}

