import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { can } from "@/lib/permissions";
import { fromCents, toCents } from "@/lib/money";
import { audit, getBusiness, HttpError, nextNumber, r, todayIn, type Ctx, type Route } from "../core";
import { buildReportParts } from "../exports/reports";
import { buildCsvZip } from "@/features/exports/csv";
import { buildXlsxWorkbook } from "@/features/exports/xlsx";
import { ExportTooLargeError, totalRows, type SheetId } from "@/features/exports/spec";

const uuid = z.string().uuid();
const RECEIPT_PRESETS = ["58mm", "80mm", "digital", "a4", "a5", "a4_a5", "monochrome"] as const;
const REPORT_PRESETS = ["executive", "complete", "daily", "monthly", "pos_cashier", "finance", "branch", "custom"] as const;

export type ReceiptSnapshot = {
  kind: "receipt";
  businessName: string;
  businessAddress: string;
  businessContact: string;
  currency: string;
  timezone: string;
  invoiceNumber: string;
  issuedAt: string;
  operator: string;
  clientName: string | null;
  items: {
    name: string;
    qty: string;
    unitPriceCents: string;
    discountCents: string;
    totalCents: string;
  }[];
  subtotalCents: string;
  discountCents: string;
  taxCents: string;
  totalCents: string;
  paidCents: string;
  changeOrDueCents: string;
  isPartialOrDue: boolean;
  verificationCode: string;
  reportNumber: string;
};

export type ActivityModuleSummary = {
  key: string;
  label: string;
  hasActivity: boolean;
  summary: string;
  count: number;
};

export type ActivitySnapshot = {
  kind: "activity_summary";
  businessName: string;
  branchName: string;
  currency: string;
  timezone: string;
  from: string;
  to: string;
  generatedAt: string;
  operator: string;
  reportNumber: string;
  verificationCode: string;
  kpis: {
    totalActivities: number;
    totalSalesCents: string;
    totalIncomeCents: string;
    totalExpenseCents: string;
  };
  modules: ActivityModuleSummary[];
  conclusion: string;
};

function safeToCents(val: unknown): bigint {
  const s = String(val ?? "0").trim();
  if (!s) return 0n;
  const neg = s.startsWith("-");
  const clean = neg ? s.slice(1) : s;
  const c = toCents(clean);
  return neg ? -c : c;
}

/**
 * Normalisasi kuantitas NUMERIC(18,3) ke string tanpa floating point (BF-019).
 * "2.000" -> "2", "1.250" -> "1.25", "0.500" -> "0.5". Non-numerik dibiarkan apa adanya.
 */
function normalizeQty(value: unknown): string {
  const s = String(value ?? "0").trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return s;
  const frac = (m[3] ?? "").replace(/0+$/, "");
  return `${m[1]}${m[2]}${frac ? `.${frac}` : ""}`;
}

function verificationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function inRepeatableReadTenant<T>(ctx: Ctx, fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SELECT set_config('app.workspace_id', ${ctx.workspaceId}, true)`);
      await tx.execute(sql`SET LOCAL ROLE bf_app`);
      return fn(tx);
    },
    { isolationLevel: "repeatable read" },
  );
}

export const exportRoutes: Route[] = [
  /* ───────── Generate Receipt Snapshot & Record ───────── */
  r("POST", "/exports/receipt", { perm: "export:create" }, async ({ ctx, json }) => {
    const b = await json(
      z.object({
        invoiceId: uuid,
        format: z.enum(["pdf", "jpg", "png"]),
        download: z.boolean().optional(),
        templatePreset: z.enum(RECEIPT_PRESETS).default("80mm"),
        templateId: uuid.optional(),
      }),
    );

    return inRepeatableReadTenant(ctx, async (tx) => {
      const biz = await getBusiness(tx, ctx);
      const ws = ctx.workspaceId;

      const invRes = await tx.execute(sql`
        SELECT i.id, i.number, i.subtotal::text, i.discount::text, i.tax::text, i.total::text, i.paid::text,
               i.issued_at, i.status, i.operator AS inv_operator, c.name AS client_name
        FROM invoices i
        LEFT JOIN clients c ON c.id = i.client_id AND c.workspace_id = i.workspace_id
        WHERE i.id = ${b.invoiceId} AND i.workspace_id = ${ws}
        LIMIT 1
      `);
      const inv = invRes.rows[0] as Record<string, unknown> | undefined;
      if (!inv) throw new HttpError(404, "Faktur / transaksi tidak ditemukan.", "not_found");

      const linesRes = await tx.execute(sql`
        SELECT l.description, l.quantity::text AS quantity, l.unit_price::text AS unit_price, l.line_total::text AS line_total
        FROM invoice_lines l
        WHERE l.invoice_id = ${b.invoiceId} AND l.workspace_id = ${ws}
        ORDER BY l.id ASC
      `);

      // BF-011: dibayar = jumlah pembayaran yang BELUM dibalik. Faktur yang sudah direversal
      // selalu 0; kolom `paid` hanya dipakai bila faktur tidak punya baris pembayaran sama sekali
      // (data lama sebelum tabel payments dipakai).
      const payRes = await tx.execute(sql`
        SELECT coalesce(sum(amount) FILTER (WHERE reversed = false), 0)::text AS paid_sum,
               count(*)::int AS all_cnt
        FROM payments
        WHERE invoice_id = ${b.invoiceId} AND workspace_id = ${ws}
      `);
      const payRow = payRes.rows[0] as { paid_sum?: string; all_cnt?: number } | undefined;
      const paidSum = safeToCents(payRow?.paid_sum ?? "0");
      const totalCents = safeToCents(inv.total);
      const hasPaymentRows = Number(payRow?.all_cnt ?? 0) > 0;
      const paidCents = inv.status === "reversed" ? 0n : hasPaymentRows ? paidSum : safeToCents(inv.paid);
      const diff = paidCents - totalCents;

      let templateVersion = 1;
      let templateConfig: Record<string, unknown> = {};
      if (b.templateId) {
        const tplRes = await tx.execute(sql`
          SELECT t.current_version, v.config
          FROM receipt_templates t
          JOIN receipt_template_versions v ON v.template_id = t.id AND v.version = t.current_version
          WHERE t.id = ${b.templateId} AND t.workspace_id = ${ws}
          LIMIT 1
        `);
        if (tplRes.rows[0]) {
          templateVersion = Number((tplRes.rows[0] as { current_version: number }).current_version);
          templateConfig = (tplRes.rows[0] as { config: Record<string, unknown> }).config ?? {};
        }
      }

      const code = verificationCode();
      const reportNumber = await nextNumber(tx, ws, "export_receipt", "STR");

      const snapshot: ReceiptSnapshot = {
        kind: "receipt",
        businessName: String(templateConfig.businessName ?? biz.name),
        businessAddress: String(templateConfig.address ?? biz.address ?? "Alamat usaha belum diisi"),
        businessContact: String(templateConfig.contact ?? biz.slogan ?? "—"),
        currency: biz.currency,
        timezone: biz.timezone,
        invoiceNumber: String(inv.number),
        issuedAt: new Date(String(inv.issued_at)).toISOString(),
        operator: String(inv.inv_operator ?? ctx.operator ?? ctx.deviceName),
        clientName: can(ctx.role, "crm:read") && inv.client_name ? String(inv.client_name) : null,
        items: (linesRes.rows as Record<string, unknown>[]).map((l) => {
          return {
            name: String(l.description),
            qty: normalizeQty(l.quantity),
            unitPriceCents: String(safeToCents(l.unit_price)),
            discountCents: "0",
            totalCents: String(safeToCents(l.line_total)),
          };
        }),
        subtotalCents: String(safeToCents(inv.subtotal)),
        discountCents: String(safeToCents(inv.discount)),
        taxCents: String(safeToCents(inv.tax)),
        totalCents: String(totalCents),
        paidCents: String(paidCents),
        changeOrDueCents: String(diff >= 0n ? diff : -diff),
        isPartialOrDue: paidCents < totalCents,
        verificationCode: code,
        reportNumber,
      };

      const ins = await tx.execute(sql`
        INSERT INTO export_records (
          workspace_id, kind, format, template_preset, template_id, template_version,
          source_id, report_number, verification_code, params, snapshot, status,
          created_by_device_id, created_by_operator
        ) VALUES (
          ${ws}, 'receipt', ${b.format}, ${b.templatePreset}, ${b.templateId ?? null}, ${templateVersion},
          ${b.invoiceId}, ${reportNumber}, ${code}, ${JSON.stringify(b)}::jsonb, ${JSON.stringify(snapshot)}::jsonb,
          ${b.download === false ? 'preview' : 'pending'}, ${ctx.deviceId}, ${ctx.operator ?? ctx.deviceName}
        )
        RETURNING id, created_at
      `);
      const rec = ins.rows[0] as { id: string; created_at: string };
      await audit(tx, ctx, "export.receipt", "export_record", rec.id, {
        invoiceId: b.invoiceId,
        format: b.format,
        preset: b.templatePreset,
      });

      return { id: rec.id, createdAt: rec.created_at, snapshot, templateConfig, templateVersion };
    });
  }),

  /* ───────── Generate Activity Summary Snapshot & Record ───────── */
  r("POST", "/exports/activity", { perm: "export:create" }, async ({ ctx, json }) => {
    const b = await json(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        format: z.enum(["pdf", "jpg", "png", "xlsx", "csv"]),
        download: z.boolean().optional(),
        templatePreset: z.enum(REPORT_PRESETS).default("executive"),
        templateId: uuid.optional(),
        clientId: uuid.optional(),
      }),
    );

    return inRepeatableReadTenant(ctx, async (tx) => {
      const biz = await getBusiness(tx, ctx);
      const ws = ctx.workspaceId;
      const to = b.to || todayIn(biz.timezone);
      const d = new Date(`${to}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 29);
      const from = b.from || d.toISOString().slice(0, 10);
      if (from > to) throw new HttpError(422, "Tanggal awal setelah tanggal akhir.");

      const branchRes = await tx.execute(sql`SELECT name FROM branches WHERE workspace_id = ${ws} AND is_main = true LIMIT 1`);
      const salesRes = await tx.execute(sql`
        SELECT count(*)::int AS cnt, coalesce(sum(total), 0)::text AS total
        FROM invoices
        WHERE workspace_id = ${ws} AND status <> 'reversed'
          AND (issued_at AT TIME ZONE ${biz.timezone})::date BETWEEN ${from}::date AND ${to}::date
          ${b.clientId ? sql`AND client_id = ${b.clientId}` : sql``}
      `);
      const finRes = await tx.execute(sql`
        SELECT
          count(*)::int AS cnt,
          coalesce(sum(case when type = 'income' and state = 'posted' then amount else 0 end), 0)::text AS inc,
          coalesce(sum(case when type = 'expense' and state = 'posted' then amount else 0 end), 0)::text AS exp
        FROM finance_transactions
        WHERE workspace_id = ${ws} AND tx_date BETWEEN ${from}::date AND ${to}::date
      `);
      const crmRes = can(ctx.role, "crm:read")
        ? await tx.execute(sql`
            SELECT count(*)::int AS cnt
            FROM client_activities
            WHERE workspace_id = ${ws}
              AND (created_at AT TIME ZONE ${biz.timezone})::date BETWEEN ${from}::date AND ${to}::date
              ${b.clientId ? sql`AND client_id = ${b.clientId}` : sql``}
          `)
        : { rows: [{ cnt: 0 }] };
      const invRes = await tx.execute(sql`
        SELECT count(*)::int AS cnt
        FROM stock_movements
        WHERE workspace_id = ${ws}
          AND (created_at AT TIME ZONE ${biz.timezone})::date BETWEEN ${from}::date AND ${to}::date
      `);
      const poRes = await tx.execute(sql`
        SELECT count(*)::int AS cnt, coalesce(sum(total), 0)::text AS total
        FROM purchase_orders
        WHERE workspace_id = ${ws}
          AND (ordered_at AT TIME ZONE ${biz.timezone})::date BETWEEN ${from}::date AND ${to}::date
      `);
      const bkRes = await tx.execute(sql`
        SELECT count(*)::int AS cnt
        FROM bookings
        WHERE workspace_id = ${ws}
          AND (starts_at AT TIME ZONE ${biz.timezone})::date BETWEEN ${from}::date AND ${to}::date
      `);
      const hrRes = await tx.execute(sql`
        SELECT count(*)::int AS cnt
        FROM attendance
        WHERE workspace_id = ${ws} AND work_date BETWEEN ${from}::date AND ${to}::date
      `);
      const opsRes = await tx.execute(sql`
        SELECT count(*)::int AS cnt
        FROM ops_logs
        WHERE workspace_id = ${ws}
          AND (created_at AT TIME ZONE ${biz.timezone})::date BETWEEN ${from}::date AND ${to}::date
      `);
      const projRes = await tx.execute(sql`
        SELECT count(*)::int AS cnt
        FROM projects
        WHERE workspace_id = ${ws}
          AND (created_at AT TIME ZONE ${biz.timezone})::date BETWEEN ${from}::date AND ${to}::date
      `);

      const salesRow = salesRes.rows[0] as { cnt: number; total: string };
      const finRow = finRes.rows[0] as { cnt: number; inc: string; exp: string };
      const crmCnt = Number((crmRes.rows[0] as { cnt: number }).cnt);
      const invCnt = Number((invRes.rows[0] as { cnt: number }).cnt);
      const poRow = poRes.rows[0] as { cnt: number; total: string };
      const bkCnt = Number((bkRes.rows[0] as { cnt: number }).cnt);
      const hrCnt = Number((hrRes.rows[0] as { cnt: number }).cnt);
      const opsCnt = Number((opsRes.rows[0] as { cnt: number }).cnt);
      const projCnt = Number((projRes.rows[0] as { cnt: number }).cnt);

      const salesCents = safeToCents(salesRow.total);
      const incCents = safeToCents(finRow.inc);
      const expCents = safeToCents(finRow.exp);
      const poCents = safeToCents(poRow.total);

      const emptyMsg = "Tidak ada aktivitas pada periode ini";
      const fmt = (c: bigint) => `${biz.currency} ${fromCents(c)}`;

      const modules: ActivityModuleSummary[] = [
        {
          key: "sales",
          label: "Sales & POS",
          hasActivity: salesRow.cnt > 0,
          count: salesRow.cnt,
          summary: salesRow.cnt > 0 ? `${salesRow.cnt} transaksi (${fmt(salesCents)})` : emptyMsg,
        },
        {
          key: "finance",
          label: "Finance",
          hasActivity: finRow.cnt > 0,
          count: finRow.cnt,
          summary: finRow.cnt > 0 ? `${finRow.cnt} transaksi (Masuk ${fmt(incCents)} · Keluar ${fmt(expCents)})` : emptyMsg,
        },
        {
          key: "crm",
          label: "CRM & Clients",
          hasActivity: crmCnt > 0,
          count: crmCnt,
          summary: !can(ctx.role, "crm:read") ? "Terbatas oleh izin peran" : crmCnt > 0 ? `${crmCnt} aktivitas klien` : emptyMsg,
        },
        {
          key: "inventory",
          label: "Inventory",
          hasActivity: invCnt > 0,
          count: invCnt,
          summary: invCnt > 0 ? `${invCnt} mutasi stok` : emptyMsg,
        },
        {
          key: "purchasing",
          label: "Purchasing",
          hasActivity: poRow.cnt > 0,
          count: poRow.cnt,
          summary: poRow.cnt > 0 ? `${poRow.cnt} PO (${fmt(poCents)})` : emptyMsg,
        },
        {
          key: "bookings",
          label: "Orders & Booking",
          hasActivity: bkCnt > 0,
          count: bkCnt,
          summary: bkCnt > 0 ? `${bkCnt} jadwal/booking` : emptyMsg,
        },
        {
          key: "hr",
          label: "Employee & HR",
          hasActivity: hrCnt > 0,
          count: hrCnt,
          summary: hrCnt > 0 ? `${hrCnt} catatan absensi` : emptyMsg,
        },
        {
          key: "operations",
          label: "Operations",
          hasActivity: opsCnt > 0,
          count: opsCnt,
          summary: opsCnt > 0 ? `${opsCnt} log operasional` : emptyMsg,
        },
        {
          key: "projects",
          label: "Projects & Assets",
          hasActivity: projCnt > 0,
          count: projCnt,
          summary: projCnt > 0 ? `${projCnt} proyek baru` : emptyMsg,
        },
      ];

      const totalActivities = modules.reduce((acc, m) => acc + m.count, 0);
      const netFlow = incCents - expCents;
      const conclusion =
        totalActivities === 0
          ? `Belum ada aktivitas tercatat pada periode ${from} s.d. ${to}.`
          : `Tercatat ${totalActivities} aktivitas di seluruh modul pada ${from} s.d. ${to}, dengan total penjualan ${fmt(salesCents)} dan arus kas bersih ${netFlow >= 0n ? "+" : "-"}${biz.currency} ${fromCents(netFlow >= 0n ? netFlow : -netFlow)}.`;

      let templateVersion = 1;
      let templateConfig: Record<string, unknown> = {};
      if (b.templateId) {
        const tplRes = await tx.execute(sql`
          SELECT t.current_version, v.config
          FROM report_templates t
          JOIN report_template_versions v ON v.template_id = t.id AND v.version = t.current_version
          WHERE t.id = ${b.templateId} AND t.workspace_id = ${ws}
          LIMIT 1
        `);
        if (tplRes.rows[0]) {
          templateVersion = Number((tplRes.rows[0] as { current_version: number }).current_version);
          templateConfig = (tplRes.rows[0] as { config: Record<string, unknown> }).config ?? {};
        }
      }

      const code = verificationCode();
      const reportNumber = await nextNumber(tx, ws, "export_activity", "RPT");
      const branchName = String((branchRes.rows[0] as { name?: string } | undefined)?.name ?? "Utama");

      const snapshot: ActivitySnapshot = {
        kind: "activity_summary",
        businessName: String(templateConfig.businessName ?? biz.name),
        branchName,
        currency: biz.currency,
        timezone: biz.timezone,
        from,
        to,
        generatedAt: new Date().toISOString(),
        operator: ctx.operator ?? ctx.deviceName,
        reportNumber,
        verificationCode: code,
        kpis: {
          totalActivities,
          totalSalesCents: String(salesCents),
          totalIncomeCents: String(incCents),
          totalExpenseCents: String(expCents),
        },
        modules,
        conclusion,
      };

      const ins = await tx.execute(sql`
        INSERT INTO export_records (
          workspace_id, kind, format, template_preset, template_id, template_version,
          source_id, report_number, verification_code, params, snapshot, status,
          created_by_device_id, created_by_operator
        ) VALUES (
          ${ws}, 'activity_summary', ${b.format}, ${b.templatePreset}, ${b.templateId ?? null}, ${templateVersion},
          ${b.clientId ?? null}, ${reportNumber}, ${code}, ${JSON.stringify({ ...b, from, to })}::jsonb,
          ${JSON.stringify(snapshot)}::jsonb, ${b.download === false ? 'preview' : 'pending'}, ${ctx.deviceId}, ${ctx.operator ?? ctx.deviceName}
        )
        RETURNING id, created_at
      `);
      const rec = ins.rows[0] as { id: string; created_at: string };
      await audit(tx, ctx, "export.activity", "export_record", rec.id, { from, to, format: b.format, preset: b.templatePreset });

      return { id: rec.id, createdAt: rec.created_at, snapshot, templateConfig, templateVersion };
    });
  }),

  /* ───────── History, Re-download & Code Verification ───────── */
  // Klien merender file di perangkat; status "completed" hanya setelah klien mengonfirmasi file benar-benar dibuat.
  r("POST", "/exports/:id/complete", { perm: "export:create" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Riwayat ekspor tidak ditemukan.");
    const res = await tx.execute(sql`
      UPDATE export_records SET status = 'completed', completed_at = now(), error = NULL
      WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} AND status IN ('pending', 'failed') RETURNING id, status`);
    if (!res.rows.length) throw new HttpError(409, "Ekspor tidak dalam status menunggu.", "bad_transition");
    return res.rows[0];
  }),

  r("POST", "/exports/:id/fail", { perm: "export:create" }, async ({ ctx, tx, params, json }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Riwayat ekspor tidak ditemukan.");
    const b = await json(z.object({ error: z.string().max(300).default("Gagal membuat file di perangkat.") }));
    const res = await tx.execute(sql`
      UPDATE export_records SET status = 'failed', error = ${b.error}
      WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} AND status = 'pending' RETURNING id, status`);
    if (!res.rows.length) throw new HttpError(409, "Ekspor tidak dalam status menunggu.", "bad_transition");
    return res.rows[0];
  }),

  r("GET", "/exports/history", { perm: "export:read" }, async ({ ctx, tx, query }) => {
    const kind = query.get("kind");
    const rows = await tx.execute(sql`
      SELECT id, kind, format, template_preset AS "templatePreset", template_version AS "templateVersion",
             report_number AS "reportNumber", verification_code AS "verificationCode",
             CASE WHEN status = 'pending' AND created_at < now() - interval '10 minutes' THEN 'failed' ELSE status END AS status,
             created_by_operator AS "operator", created_at AS "createdAt"
      FROM export_records
      WHERE workspace_id = ${ctx.workspaceId} AND status <> 'preview'
        ${kind ? sql`AND kind = ${kind}` : sql``}
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return { items: rows.rows };
  }),

  r("GET", "/exports/verify", { perm: "export:read" }, async ({ ctx, tx, query }) => {
    const code = (query.get("code") ?? "").trim().toUpperCase();
    if (!code) throw new HttpError(422, "Masukkan kode verifikasi.");
    const res = await tx.execute(sql`
      SELECT id, kind, format, report_number AS "reportNumber", verification_code AS "verificationCode",
             created_by_operator AS "operator", created_at AS "createdAt", snapshot
      FROM export_records
      WHERE workspace_id = ${ctx.workspaceId} AND verification_code = ${code}
      LIMIT 1
    `);
    if (!res.rows.length) return { valid: false };
    return { valid: true, record: res.rows[0] };
  }),

  r("GET", "/exports/:id", { perm: "export:read" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Riwayat ekspor tidak ditemukan.");
    const res = await tx.execute(sql`
      SELECT id, kind, format, template_preset AS "templatePreset", template_id AS "templateId",
             template_version AS "templateVersion", snapshot, created_at AS "createdAt"
      FROM export_records
      WHERE workspace_id = ${ctx.workspaceId} AND id = ${params.id}
      LIMIT 1
    `);
    const rec = res.rows[0] as Record<string, unknown> | undefined;
    if (!rec) throw new HttpError(404, "Riwayat ekspor tidak ditemukan.");

    let templateConfig: Record<string, unknown> = {};
    if (rec.templateId) {
      const tplId = String(rec.templateId);
      const tplVer = Number(rec.templateVersion);
      const vRes =
        rec.kind === "receipt"
          ? await tx.execute(sql`
              SELECT config FROM receipt_template_versions
              WHERE workspace_id = ${ctx.workspaceId} AND template_id = ${tplId}::uuid AND version = ${tplVer}
              LIMIT 1
            `)
          : await tx.execute(sql`
              SELECT config FROM report_template_versions
              WHERE workspace_id = ${ctx.workspaceId} AND template_id = ${tplId}::uuid AND version = ${tplVer}
              LIMIT 1
            `);
      if (vRes.rows[0]) templateConfig = (vRes.rows[0] as { config: Record<string, unknown> }).config ?? {};
    }
    await audit(tx, ctx, "export.redownload", "export_record", params.id);
    return { ...rec, templateConfig };
  }),

  /* ───────── Template Versioning (Receipt & Report) ───────── */
  r("GET", "/exports/templates/list", { perm: "export:read" }, async ({ ctx, tx }) => {
    const receipts = await tx.execute(sql`
      SELECT t.id, t.name, t.size_preset AS "sizePreset", t.current_version AS "currentVersion", v.config
      FROM receipt_templates t
      JOIN receipt_template_versions v ON v.template_id = t.id AND v.version = t.current_version
      WHERE t.workspace_id = ${ctx.workspaceId}
      ORDER BY t.updated_at DESC
    `);
    const reports = await tx.execute(sql`
      SELECT t.id, t.name, t.preset, t.current_version AS "currentVersion", v.config
      FROM report_templates t
      JOIN report_template_versions v ON v.template_id = t.id AND v.version = t.current_version
      WHERE t.workspace_id = ${ctx.workspaceId}
      ORDER BY t.updated_at DESC
    `);
    return { receiptTemplates: receipts.rows, reportTemplates: reports.rows };
  }),

  r("POST", "/exports/templates", { perm: "export:create" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        kind: z.enum(["receipt", "report"]),
        id: uuid.optional(),
        name: z.string().trim().min(1).max(80),
        preset: z.string().trim().min(1).max(30),
        config: z.record(z.string(), z.unknown()),
      }),
    );

    if (b.kind === "receipt") {
      if (b.id) {
        const up = await tx.execute(sql`
          UPDATE receipt_templates
          SET name = ${b.name}, size_preset = ${b.preset}, current_version = current_version + 1, updated_at = now()
          WHERE id = ${b.id} AND workspace_id = ${ctx.workspaceId}
          RETURNING id, current_version
        `);
        if (!up.rows.length) throw new HttpError(404, "Template struk tidak ditemukan.");
        const v = Number((up.rows[0] as { current_version: number }).current_version);
        await tx.execute(sql`
          INSERT INTO receipt_template_versions (workspace_id, template_id, version, config, created_by_device_id)
          VALUES (${ctx.workspaceId}, ${b.id}, ${v}, ${JSON.stringify(b.config)}::jsonb, ${ctx.deviceId})
        `);
        return { id: b.id, version: v };
      }
      const ins = await tx.execute(sql`
        INSERT INTO receipt_templates (workspace_id, name, size_preset, current_version)
        VALUES (${ctx.workspaceId}, ${b.name}, ${b.preset}, 1)
        RETURNING id
      `);
      const id = String((ins.rows[0] as { id: string }).id);
      await tx.execute(sql`
        INSERT INTO receipt_template_versions (workspace_id, template_id, version, config, created_by_device_id)
        VALUES (${ctx.workspaceId}, ${id}, 1, ${JSON.stringify(b.config)}::jsonb, ${ctx.deviceId})
      `);
      return { id, version: 1 };
    }

    if (b.id) {
      const up = await tx.execute(sql`
        UPDATE report_templates
        SET name = ${b.name}, preset = ${b.preset}, current_version = current_version + 1, updated_at = now()
        WHERE id = ${b.id} AND workspace_id = ${ctx.workspaceId}
        RETURNING id, current_version
      `);
      if (!up.rows.length) throw new HttpError(404, "Template laporan tidak ditemukan.");
      const v = Number((up.rows[0] as { current_version: number }).current_version);
      await tx.execute(sql`
        INSERT INTO report_template_versions (workspace_id, template_id, version, config, created_by_device_id)
        VALUES (${ctx.workspaceId}, ${b.id}, ${v}, ${JSON.stringify(b.config)}::jsonb, ${ctx.deviceId})
      `);
      return { id: b.id, version: v };
    }
    const ins = await tx.execute(sql`
      INSERT INTO report_templates (workspace_id, name, preset, current_version)
      VALUES (${ctx.workspaceId}, ${b.name}, ${b.preset}, 1)
      RETURNING id
    `);
    const id = String((ins.rows[0] as { id: string }).id);
    await tx.execute(sql`
      INSERT INTO report_template_versions (workspace_id, template_id, version, config, created_by_device_id)
      VALUES (${ctx.workspaceId}, ${id}, 1, ${JSON.stringify(b.config)}::jsonb, ${ctx.deviceId})
    `);
    return { id, version: 1 };
  }),

  /* ───────── Ekspor LAPORAN (XLSX bergaya / paket CSV) — R11-D ───────── */
  r("POST", "/exports/reports", { perm: "export:create" }, async ({ ctx, json, tx }) => {
    const b = await json(
      z.object({
        report: z.enum(["marketplace", "revenue", "pnl", "bank", "settlement", "all"]),
        format: z.enum(["xlsx", "csv"]),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        currency: z.string().length(3).optional(),
      }),
    );
    if (b.from > b.to) throw new HttpError(422, "Tanggal awal setelah tanggal akhir.", "invalid_range");

    const biz = await getBusiness(tx, ctx);
    const currency = (b.currency ?? biz.currency ?? "IDR").toUpperCase();

    // Batas sinkron 50.000 baris (A3.5): di atas itu pengguna diminta memecah periode.
    let parts;
    try {
      parts = await buildReportParts(tx, ctx.workspaceId, {
        report: b.report as SheetId | "all",
        from: b.from,
        to: b.to,
        currency,
      });
    } catch (err) {
      if (err instanceof ExportTooLargeError) throw new HttpError(422, err.message, err.code);
      throw err;
    }

    const generatedAt = new Date().toISOString();
    const meta = {
      title: b.report === "all" ? "Laporan Business Flow" : `Laporan ${b.report}`,
      businessName: biz.name,
      from: b.from,
      to: b.to,
      currency,
      generatedAt,
    };
    const bytes = b.format === "xlsx" ? await buildXlsxWorkbook(parts, meta) : buildCsvZip(parts);
    const rowCount = totalRows(parts);
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    // Jejak audit: parameter, jumlah baris, dan hash SHA-256 berkas (bukan isi berkasnya).
    const code = verificationCode();
    const reportNumber = await nextNumber(tx, ctx.workspaceId, "export_report", "EXP");
    const snapshot = {
      kind: "report_export" as const,
      report: b.report,
      format: b.format,
      from: b.from,
      to: b.to,
      currency,
      sheets: parts.map((p) => ({ id: p.spec.id, rows: p.rows.length })),
      rowCount,
      bytes: bytes.length,
      sha256,
      reportNumber,
      verificationCode: code,
      generatedAt,
    };
    const ins = await tx.execute(sql`
      INSERT INTO export_records (
        workspace_id, kind, format, template_preset, source_id,
        report_number, verification_code, params, snapshot, status,
        created_by_device_id, created_by_operator, completed_at
      ) VALUES (
        ${ctx.workspaceId}, 'report_export', ${b.format}, 'report_export', ${null},
        ${reportNumber}, ${code}, ${JSON.stringify(b)}::jsonb, ${JSON.stringify(snapshot)}::jsonb, 'completed',
        ${ctx.deviceId}, ${ctx.operator ?? ctx.deviceName}, now()
      )
      RETURNING id
    `);
    const recordId = (ins.rows[0] as { id: string }).id;
    await audit(tx, ctx, "export.report", "export_record", recordId, {
      report: b.report,
      format: b.format,
      from: b.from,
      to: b.to,
      rowCount,
      sha256,
    });

    const ext = b.format === "xlsx" ? "xlsx" : "zip";
    const filename = `business-flow-${b.report}-${b.from}_${b.to}.${ext}`;
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type":
          b.format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        "x-export-report-number": reportNumber,
        "x-export-verification-code": code,
        "x-export-rows": String(rowCount),
        "x-export-sha256": sha256,
        "cache-control": "no-store",
      },
    });
  }),
];
