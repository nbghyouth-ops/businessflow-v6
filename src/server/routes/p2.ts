import { sql } from "drizzle-orm";
import { z } from "zod";
import { fromCents, fromMilli, mulQty, toCents, toMilli } from "@/lib/money";
import { audit, getBusiness, HttpError, idempotent, nextNumber, r, todayIn, type Ctx, type DB, type Route, type Tx } from "../core";
import { insertImportRow, rollbackImportRows, validateImportRow } from "../imports";
import { IMPORT_TARGET_KEYS } from "@/lib/import-targets";
import { accountBySubtype, ensureSystemAccount, postJournal, reverseJournal } from "../accounting";
import { calcPayroll, PayrollError } from "../payroll";

const uuid = z.string().uuid();

/** SATU-SATUNYA jalur penyelesaian transfer stok (pembuatan status=completed maupun rute /complete). */
async function completeTransferById(tx: DB, ctx: Ctx, id: string) {
        const trfRes = await tx.execute(sql`
      SELECT id, number, from_warehouse_id AS "fromWarehouseId", to_warehouse_id AS "toWarehouseId",
             product_id AS "productId", qty_milli AS "qtyMilli", status
      FROM stock_transfers WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}
      FOR UPDATE
    `);
    const trf = trfRes.rows[0] as {
      id: string;
      number: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      productId: string;
      qtyMilli: string | number;
      status: string;
    } | undefined;
    if (!trf) throw new HttpError(404, "Transfer tidak ditemukan.");
    if (trf.status === "completed") throw new HttpError(409, "Transfer sudah berstatus selesai.");

    if (trf.status === "cancelled") throw new HttpError(409, "Transfer sudah dibatalkan.", "bad_transition");
    const qtyMilli = BigInt(trf.qtyMilli);
    const qty = fromMilli(qtyMilli); // string desimal; tanpa float
    await tx.execute(sql`SELECT id FROM products WHERE id = ${trf.productId} AND workspace_id = ${ctx.workspaceId} FOR UPDATE`);
    const stockRes = await tx.execute(sql`
      SELECT COALESCE(SUM(quantity), 0)::text AS current_stock
      FROM stock_movements
      WHERE workspace_id = ${ctx.workspaceId} AND warehouse_id = ${trf.fromWarehouseId} AND product_id = ${trf.productId}
    `);
    const currentMilli = toMilli((stockRes.rows[0] as { current_stock: string }).current_stock);
    if (currentMilli < qtyMilli) {
      throw new HttpError(409, `Stok gudang asal tidak mencukupi (tersedia: ${fromMilli(currentMilli)}, diminta: ${qty}).`, "insufficient_stock");
    }

    const prodRes = await tx.execute(sql`
      SELECT avg_cost::text AS "costPrice" FROM products WHERE id = ${trf.productId} AND workspace_id = ${ctx.workspaceId} LIMIT 1
    `);
    const unitCost = String((prodRes.rows[0] as { costPrice: unknown })?.costPrice ?? "0");

    await tx.execute(sql`
      INSERT INTO stock_movements (
        workspace_id, business_id, warehouse_id, product_id, quantity, unit_cost, kind, ref_type, ref_id, note, device_id
      ) VALUES (
        ${ctx.workspaceId}, ${ctx.businessId}, ${trf.fromWarehouseId}, ${trf.productId},
        ${fromMilli(-qtyMilli)}::numeric, ${unitCost}::numeric, 'transfer_out', 'stock_transfer', ${trf.id}::uuid,
        ${'Transfer keluar ke ' + trf.number}, ${ctx.deviceId}
      )
    `);

    await tx.execute(sql`
      INSERT INTO stock_movements (
        workspace_id, business_id, warehouse_id, product_id, quantity, unit_cost, kind, ref_type, ref_id, note, device_id
      ) VALUES (
        ${ctx.workspaceId}, ${ctx.businessId}, ${trf.toWarehouseId}, ${trf.productId},
        ${qty}::numeric, ${unitCost}::numeric, 'transfer_in', 'stock_transfer', ${trf.id}::uuid,
        ${'Transfer masuk dari ' + trf.number}, ${ctx.deviceId}
      )
    `);

    const up = await tx.execute(sql`
      UPDATE stock_transfers SET status = 'completed' WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}
      RETURNING id, number, status
    `);
    await audit(tx, ctx, "stock.transfer.complete", "stock_transfer", trf.id, { number: trf.number, qty });
    return up.rows[0];
}

/** SATU-SATUNYA jalur posting opname (dipakai oleh pembuatan status=posted maupun rute /post). */
async function postStockCountById(tx: DB, ctx: Ctx, id: string) {
        const countRes = await tx.execute(sql`
      SELECT id, number, warehouse_id AS "warehouseId", items, status
      FROM stock_counts WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}
      FOR UPDATE
    `);
    const sc = countRes.rows[0] as {
      id: string;
      number: string;
      warehouseId: string;
      items: Array<{ productId: string; countedQty: number; systemQty?: number; varianceQty?: number; unitCost?: string }>;
      status: string;
    } | undefined;
    if (!sc) throw new HttpError(404, "Stock opname tidak ditemukan.");
    if (sc.status === "posted") throw new HttpError(409, "Stock opname sudah diposting.");

    const items = Array.isArray(sc.items) ? sc.items : [];
    const biz = await getBusiness(tx, ctx);
    let gain = 0n, loss = 0n;
    for (const item of items) {
      // Qty & biaya dihitung dengan BigInt (milli-unit / satuan terkecil), bukan float; nilai memakai biaya rata-rata produk.
      const stockRes = await tx.execute(sql`
        SELECT COALESCE(SUM(quantity), 0)::text AS current_stock FROM stock_movements
        WHERE workspace_id = ${ctx.workspaceId} AND warehouse_id = ${sc.warehouseId} AND product_id = ${item.productId}`);
      const systemMilli = toMilli((stockRes.rows[0] as { current_stock: string }).current_stock);
      const countedMilli = toMilli(String(item.countedQty));
      const varianceMilli = countedMilli - systemMilli;
      const prodRes = await tx.execute(sql`SELECT avg_cost::text AS "avgCost" FROM products WHERE id = ${item.productId} AND workspace_id = ${ctx.workspaceId} LIMIT 1`);
      if (!prodRes.rows.length) throw new HttpError(422, "Produk pada opname tidak ditemukan.", "reference");
      const unitCost = (prodRes.rows[0] as { avgCost: string }).avgCost ?? "0";
      if (varianceMilli !== 0n) {
        await tx.execute(sql`
          INSERT INTO stock_movements (workspace_id, business_id, warehouse_id, product_id, quantity, unit_cost, kind, ref_type, ref_id, note, device_id)
          VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${sc.warehouseId}, ${item.productId}, ${fromMilli(varianceMilli)}::numeric, ${unitCost}::numeric,
            'adjustment', 'stock_count', ${sc.id}::uuid,
            ${'Penyesuaian stok opname ' + sc.number + ' (fisik: ' + fromMilli(countedMilli) + ', sistem: ' + fromMilli(systemMilli) + ')'}, ${ctx.deviceId})`);
        const value = mulQty(fromMilli(varianceMilli < 0n ? -varianceMilli : varianceMilli), unitCost);
        if (varianceMilli > 0n) gain += value; else loss += value;
      }
    }
    if (gain > 0n || loss > 0n) {
      // Jurnal selisih persediaan: GL persediaan harus ikut berubah bersama kartu stok.
      const inv = await accountBySubtype(tx as Tx, ctx.workspaceId, "inventory");
      const variance = await accountBySubtype(tx as Tx, ctx.workspaceId, "variance");
      const lines: { accountId: string; debit?: string; credit?: string }[] = [];
      if (gain > 0n) lines.push({ accountId: inv, debit: fromCents(gain) }, { accountId: variance, credit: fromCents(gain) });
      if (loss > 0n) lines.push({ accountId: variance, debit: fromCents(loss) }, { accountId: inv, credit: fromCents(loss) });
      await postJournal(tx as Tx, ctx, { date: todayIn(biz.timezone), memo: `Selisih opname ${sc.number}`, source: "stock_count", sourceId: sc.id, lines });
    }

    const up = await tx.execute(sql`
      UPDATE stock_counts SET status = 'posted' WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}
      RETURNING id, number, status
    `);
    await audit(tx, ctx, "stock.count.posted", "stock_count", sc.id, { number: sc.number });
    return up.rows[0];
}

export const p2Routes: Route[] = [
  /* ───────── 1. Quotations & Sales Orders ───────── */
  r("GET", "/p2/quotations", { perm: "sales:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, number, client_id AS "clientId", status, valid_until AS "validUntil",
             subtotal::text, discount::text, tax::text, total::text, notes, lines, created_at AS "createdAt"
      FROM quotations WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/p2/quotations", { perm: "sales:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        clientId: uuid.optional(),
        validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        notes: z.string().max(500).optional(),
        lines: z
          .array(
            z.object({
              description: z.string().min(1).max(200),
              qty: z.coerce.number().positive(),
              unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
              discount: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
            }),
          )
          .min(1),
      }),
    );
    let subtotal = 0n;
    let totalDiscount = 0n;
    for (const l of b.lines) {
      const lineGross = (toCents(l.unitPrice) * BigInt(Math.round(l.qty * 1000))) / 1000n;
      const lineDisc = toCents(l.discount);
      subtotal += lineGross;
      totalDiscount += lineDisc;
    }
    const total = subtotal > totalDiscount ? subtotal - totalDiscount : 0n;
    const number = await nextNumber(tx, ctx.workspaceId, "quotation", "QUO");
    const ins = await tx.execute(sql`
      INSERT INTO quotations (workspace_id, branch_id, number, client_id, valid_until, subtotal, discount, total, notes, lines)
      VALUES (${ctx.workspaceId}, ${ctx.branchId}, ${number}, ${b.clientId ?? null}, ${b.validUntil ?? null},
              ${subtotal.toString()}, ${totalDiscount.toString()}, ${total.toString()}, ${b.notes ?? null}, ${JSON.stringify(b.lines)}::jsonb)
      RETURNING id, number, total::text, status
    `);
    await audit(tx, ctx, "quotation.create", "quotation", String((ins.rows[0] as { id: string }).id), { number });
    return ins.rows[0];
  }),

  r("POST", "/p2/quotations/:id/convert", { perm: "sales:write" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Penawaran tidak ditemukan.");
    const qRes = await tx.execute(sql`
      SELECT * FROM quotations WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} LIMIT 1
    `);
    const q = qRes.rows[0] as Record<string, unknown> | undefined;
    if (!q) throw new HttpError(404, "Penawaran tidak ditemukan.");
    const number = await nextNumber(tx, ctx.workspaceId, "sales_order", "SO");
    const so = await tx.execute(sql`
      INSERT INTO sales_orders (workspace_id, branch_id, number, quotation_id, client_id, subtotal, discount, tax, total, lines)
      VALUES (${ctx.workspaceId}, ${ctx.branchId}, ${number}, ${params.id}, ${q.client_id ?? null},
              ${String(q.subtotal)}, ${String(q.discount)}, ${String(q.tax)}, ${String(q.total)}, ${JSON.stringify(q.lines)}::jsonb)
      RETURNING id, number, status
    `);
    await tx.execute(sql`UPDATE quotations SET status = 'converted' WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId}`);
    await audit(tx, ctx, "quotation.convert", "sales_order", String((so.rows[0] as { id: string }).id), { number });
    return so.rows[0];
  }),

  r("GET", "/p2/sales-orders", { perm: "sales:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, number, quotation_id AS "quotationId", client_id AS "clientId", status,
             subtotal::text, discount::text, tax::text, total::text, lines, created_at AS "createdAt"
      FROM sales_orders WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  /* ───────── 2. Stock Transfer & Stock Count (Opname) ───────── */
  r("GET", "/p2/stock-transfers", { perm: "inventory:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, number, from_warehouse_id AS "fromWarehouseId", to_warehouse_id AS "toWarehouseId",
             product_id AS "productId", qty_milli::text AS "qtyMilli", status, note, created_at AS "createdAt"
      FROM stock_transfers WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/p2/stock-transfers", { perm: "inventory:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        fromWarehouseId: uuid,
        toWarehouseId: uuid,
        productId: uuid,
        qty: z.coerce.number().positive(),
        note: z.string().max(300).optional(),
        status: z.enum(["draft", "completed"]).default("completed"),
      }),
    );
    if (b.fromWarehouseId === b.toWarehouseId) throw new HttpError(422, "Gudang asal dan tujuan harus berbeda.");

    // Verifikasi produk dan gudang ada di workspace
    const prodRes = await tx.execute(sql`
      SELECT id, name, avg_cost::text AS "costPrice" FROM products
      WHERE id = ${b.productId} AND workspace_id = ${ctx.workspaceId} LIMIT 1
    `);
    if (!prodRes.rows.length) throw new HttpError(404, "Produk tidak ditemukan.");

    const whRes = await tx.execute(sql`
      SELECT id FROM warehouses WHERE id IN (${b.fromWarehouseId}, ${b.toWarehouseId}) AND workspace_id = ${ctx.workspaceId}
    `);
    if (whRes.rows.length < 2) throw new HttpError(422, "Gudang asal atau tujuan tidak valid dalam workspace ini.");

    const qtyMilli = toMilli(String(b.qty)).toString();
    const number = await nextNumber(tx, ctx.workspaceId, "stock_transfer", "TRF");
    const ins = await tx.execute(sql`
      INSERT INTO stock_transfers (workspace_id, number, from_warehouse_id, to_warehouse_id, product_id, qty_milli, status, note)
      VALUES (${ctx.workspaceId}, ${number}, ${b.fromWarehouseId}, ${b.toWarehouseId}, ${b.productId}, ${qtyMilli}, 'draft', ${b.note ?? null})
      RETURNING id, number, status
    `);
    const transferId = String((ins.rows[0] as { id: string }).id);
    if (b.status === "completed") return completeTransferById(tx, ctx, transferId);
    await audit(tx, ctx, "stock.transfer.create", "stock_transfer", transferId, { number });
    return ins.rows[0];
  }),

  r("POST", "/p2/stock-transfers/:id/complete", { perm: "inventory:write" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Transfer tidak ditemukan.");
    return completeTransferById(tx, ctx, params.id);
  }),

  r("GET", "/p2/stock-counts", { perm: "inventory:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, number, warehouse_id AS "warehouseId", status, items, note, created_at AS "createdAt"
      FROM stock_counts WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/p2/stock-counts", { perm: "inventory:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        warehouseId: uuid,
        note: z.string().max(300).optional(),
        items: z
          .array(
            z.object({
              productId: uuid,
              countedQty: z.coerce.number().min(0),
            }),
          )
          .min(1),
        status: z.enum(["draft", "posted"]).default("posted"),
      }),
    );
    const whRes = await tx.execute(sql`
      SELECT id FROM warehouses WHERE id = ${b.warehouseId} AND workspace_id = ${ctx.workspaceId} LIMIT 1
    `);
    if (!whRes.rows.length) throw new HttpError(404, "Gudang tidak ditemukan.");

    const number = await nextNumber(tx, ctx.workspaceId, "stock_count", "OPN");
    const detailedItems: Array<{
      productId: string;
      countedQty: number;
      systemQty: string;
      varianceQty: string;
      unitCost: string;
    }> = [];

    for (const it of b.items) {
      const prodRes = await tx.execute(sql`
        SELECT id, name, avg_cost::text AS "costPrice" FROM products
        WHERE id = ${it.productId} AND workspace_id = ${ctx.workspaceId} LIMIT 1
      `);
      if (!prodRes.rows.length) continue;
      const unitCost = String((prodRes.rows[0] as { costPrice: unknown })?.costPrice ?? "0");

      const stockRes = await tx.execute(sql`
        SELECT COALESCE(SUM(quantity), 0)::text AS current_stock
        FROM stock_movements
        WHERE workspace_id = ${ctx.workspaceId} AND warehouse_id = ${b.warehouseId} AND product_id = ${it.productId}
      `);
      const systemMilli = toMilli((stockRes.rows[0] as { current_stock: string }).current_stock);
      const systemStock = fromMilli(systemMilli);
      const variance = fromMilli(toMilli(String(it.countedQty)) - systemMilli);

      detailedItems.push({
        productId: it.productId,
        countedQty: it.countedQty,
        systemQty: systemStock,
        varianceQty: variance,
        unitCost,
      });
    }

    const ins = await tx.execute(sql`
      INSERT INTO stock_counts (workspace_id, number, warehouse_id, items, status, note)
      VALUES (${ctx.workspaceId}, ${number}, ${b.warehouseId}, ${JSON.stringify(detailedItems)}::jsonb, 'draft', ${b.note ?? null})
      RETURNING id, number, status
    `);
    const countId = String((ins.rows[0] as { id: string }).id);
    if (b.status === "posted") {
      const posted = await postStockCountById(tx, ctx, countId);
      return { ...posted, items: detailedItems };
    }
    await audit(tx, ctx, "stock.count.draft", "stock_count", countId, { number });

    return { ...ins.rows[0], items: detailedItems };
  }),

  r("POST", "/p2/stock-counts/:id/post", { perm: "inventory:write" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Stock opname tidak ditemukan.");
    return postStockCountById(tx, ctx, params.id);
  }),

  /* ───────── 3. Purchase Requests & Supplier Returns ───────── */
  r("GET", "/p2/purchase-requests", { perm: "purchasing:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, number, requester, status, items, estimated_total::text AS "estimatedTotal", note, created_at AS "createdAt"
      FROM purchase_requests WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/p2/purchase-requests", { perm: "purchasing:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        requester: z.string().min(1).max(120),
        estimatedTotal: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        note: z.string().max(400).optional(),
        items: z.array(z.object({ name: z.string().min(1), qty: z.coerce.number().positive(), productId: uuid.optional() })).min(1),
        status: z.enum(["draft", "pending_approval"]).default("pending_approval"),
      }),
    );
    const number = await nextNumber(tx, ctx.workspaceId, "purchase_request", "PR");
    const estCents = toCents(b.estimatedTotal);
    const ins = await tx.execute(sql`
      INSERT INTO purchase_requests (workspace_id, number, requester, estimated_total, items, status, note)
      VALUES (${ctx.workspaceId}, ${number}, ${b.requester}, ${estCents.toString()}, ${JSON.stringify(b.items)}::jsonb, ${b.status}, ${b.note ?? null})
      RETURNING id, number, status
    `);
    await audit(tx, ctx, "pr.create", "purchase_request", String((ins.rows[0] as { id: string }).id), { number });
    return ins.rows[0];
  }),

  r("POST", "/p2/purchase-requests/:id/approve", { perm: "purchasing:write" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "PR tidak ditemukan.");
    const up = await tx.execute(sql`
      UPDATE purchase_requests SET status = 'approved' WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} AND status IN ('draft', 'pending_approval')
      RETURNING id, status
    `);
    if (!up.rows.length) throw new HttpError(404, "PR tidak ditemukan atau status tidak dapat disetujui.");
    await audit(tx, ctx, "pr.approve", "purchase_request", params.id);
    return up.rows[0];
  }),

  r("POST", "/p2/purchase-requests/:id/reject", { perm: "purchasing:write" }, async ({ ctx, tx, params, json }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "PR tidak ditemukan.");
    const b = await json(z.object({ reason: z.string().min(1).max(300).optional() }));
    const up = await tx.execute(sql`
      UPDATE purchase_requests SET status = 'rejected', note = COALESCE(${b.reason ?? null}, note)
      WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} AND status IN ('draft', 'pending_approval')
      RETURNING id, status
    `);
    if (!up.rows.length) throw new HttpError(404, "PR tidak ditemukan atau status tidak dapat ditolak.");
    await audit(tx, ctx, "pr.reject", "purchase_request", params.id, { reason: b.reason });
    return up.rows[0];
  }),

  r("POST", "/p2/purchase-requests/:id/cancel", { perm: "purchasing:write" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "PR tidak ditemukan.");
    const up = await tx.execute(sql`
      UPDATE purchase_requests SET status = 'cancelled'
      WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} AND status <> 'cancelled'
      RETURNING id, status
    `);
    if (!up.rows.length) throw new HttpError(404, "PR tidak ditemukan atau sudah dibatalkan.");
    await audit(tx, ctx, "pr.cancel", "purchase_request", params.id);
    return up.rows[0];
  }),

  r("GET", "/p2/supplier-returns", { perm: "purchasing:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, number, supplier_id AS "supplierId", po_id AS "poId", total::text, reason, items, created_at AS "createdAt"
      FROM supplier_returns WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  // Retur ke pemasok: stok keluar (dicek, dikunci), nilai dihitung SERVER, tagihan pemasok & GL hutang berkurang bersama.
  r("POST", "/p2/supplier-returns", { perm: "purchasing:write" }, async ({ ctx, tx, json, idemKey }) => {
    const b = await json(
      z.object({
        poId: uuid,
        warehouseId: uuid.optional(),
        reason: z.string().min(1).max(300),
        items: z.array(z.object({
          productId: uuid,
          qty: z.string().regex(/^\d+(\.\d{1,3})?$/),
          unitCost: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), // harga kredit dari pemasok; default = biaya rata-rata
        })).min(1).max(100),
      }),
    );
    return idempotent(tx as Tx, ctx, idemKey, async () => {
      const po = (await tx.execute(sql`SELECT id, supplier_id AS "supplierId" FROM purchase_orders WHERE id = ${b.poId} AND workspace_id = ${ctx.workspaceId}`)).rows[0] as { id: string; supplierId: string } | undefined;
      if (!po) throw new HttpError(404, "PO tidak ditemukan.", "not_found");
      const bill = (await tx.execute(sql`SELECT id, number, total::text AS total, paid::text AS paid FROM supplier_bills WHERE po_id = ${b.poId} AND workspace_id = ${ctx.workspaceId} FOR UPDATE`)).rows[0] as
        { id: string; number: string; total: string; paid: string } | undefined;
      if (!bill) throw new HttpError(422, "Retur memerlukan PO yang sudah memiliki tagihan pemasok.", "no_bill");
      let whId = b.warehouseId;
      if (whId) {
        if (!(await tx.execute(sql`SELECT 1 FROM warehouses WHERE id = ${whId} AND workspace_id = ${ctx.workspaceId}`)).rows.length) throw new HttpError(404, "Gudang tidak ditemukan.");
      } else {
        whId = ((await tx.execute(sql`SELECT id FROM warehouses WHERE workspace_id = ${ctx.workspaceId} ORDER BY is_default DESC, created_at ASC LIMIT 1`)).rows[0] as { id: string } | undefined)?.id;
      }
      if (!whId) throw new HttpError(422, "Gudang belum dikonfigurasi di workspace ini.");
      const number = await nextNumber(tx, ctx.workspaceId, "supplier_return", "SRT");
      const lines: { productId: string; qty: string; unitCost: string; avgCost: string; name: string }[] = [];
      let apValue = 0n, invValue = 0n;
      for (const it of b.items) {
        const qty = toMilli(it.qty);
        if (qty <= 0n) throw new HttpError(422, "Jumlah retur harus lebih dari 0.", "validation");
        const p = (await tx.execute(sql`SELECT name, track_stock AS "trackStock", avg_cost::text AS "avgCost" FROM products WHERE id = ${it.productId} AND workspace_id = ${ctx.workspaceId} FOR UPDATE`)).rows[0] as
          { name: string; trackStock: boolean; avgCost: string } | undefined;
        if (!p) throw new HttpError(404, "Produk tidak ditemukan.", "not_found");
        if (!p.trackStock) throw new HttpError(422, `Produk ${p.name} tidak melacak stok.`, "not_tracked");
        const stockRow = (await tx.execute(sql`SELECT COALESCE(SUM(quantity),0)::text AS s FROM stock_movements WHERE workspace_id = ${ctx.workspaceId} AND warehouse_id = ${whId} AND product_id = ${it.productId}`)).rows[0] as { s: string };
        if (toMilli(stockRow.s) < qty) throw new HttpError(409, `Stok ${p.name} tidak cukup untuk diretur (tersedia ${stockRow.s}).`, "insufficient_stock");
        const unit = it.unitCost ?? p.avgCost;
        apValue += mulQty(it.qty, unit);
        invValue += mulQty(it.qty, p.avgCost);
        lines.push({ productId: it.productId, qty: it.qty, unitCost: unit, avgCost: p.avgCost, name: p.name });
      }
      const outstanding = toCents(bill.total) - toCents(bill.paid);
      if (apValue > outstanding) throw new HttpError(422, `Nilai retur melebihi sisa tagihan ${bill.number} (${fromCents(outstanding)}).`, "exceeds_bill");
      const ins = await tx.execute(sql`
        INSERT INTO supplier_returns (workspace_id, number, supplier_id, po_id, total, reason, items)
        VALUES (${ctx.workspaceId}, ${number}, ${po.supplierId}, ${b.poId}, ${apValue.toString()}, ${b.reason}, ${JSON.stringify(lines)}::jsonb)
        RETURNING id, number`);
      const returnId = String((ins.rows[0] as { id: string }).id);
      for (const l of lines) {
        await tx.execute(sql`
          INSERT INTO stock_movements (workspace_id, business_id, warehouse_id, product_id, quantity, unit_cost, kind, ref_type, ref_id, note, device_id)
          VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${whId}, ${l.productId}, ${fromMilli(-toMilli(l.qty))}::numeric, ${l.avgCost}::numeric,
            'supplier_return', 'supplier_return', ${returnId}::uuid, ${"Retur ke pemasok " + number + ": " + b.reason}, ${ctx.deviceId})`);
      }
      // Hutang berkurang pada tagihan (subledger) DAN GL, dengan jumlah yang sama.
      const newTotal = toCents(bill.total) - apValue;
      const paid = toCents(bill.paid);
      await tx.execute(sql`UPDATE supplier_bills SET total = ${fromCents(newTotal)}::numeric, status = ${newTotal === paid ? "paid" : paid > 0n ? "partial" : "unpaid"} WHERE id = ${bill.id}`);
      const ap = await accountBySubtype(tx as Tx, ctx.workspaceId, "payable");
      const inv = await accountBySubtype(tx as Tx, ctx.workspaceId, "inventory");
      const jl: { accountId: string; debit?: string; credit?: string }[] = [{ accountId: ap, debit: fromCents(apValue) }, { accountId: inv, credit: fromCents(invValue) }];
      const diff = apValue - invValue;
      if (diff !== 0n) {
        const variance = await accountBySubtype(tx as Tx, ctx.workspaceId, "variance");
        jl.push(diff > 0n ? { accountId: variance, credit: fromCents(diff) } : { accountId: variance, debit: fromCents(-diff) });
      }
      const biz = await getBusiness(tx, ctx);
      await postJournal(tx as Tx, ctx, { date: todayIn(biz.timezone), memo: `Retur pemasok ${number}`, source: "supplier_return", sourceId: returnId, lines: jl });
      await audit(tx, ctx, "supplier_return.create", "supplier_return", returnId, { number, total: apValue.toString() });
      return { ...(ins.rows[0] as object), totalCents: apValue.toString() };
    });
  }),

  /* ───────── 4. HR: Leave, Shifts, Payroll ───────── */
  r("GET", "/p2/leave-requests", { perm: "hr:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, employee_id AS "employeeId", leave_type AS "leaveType", start_date::text AS "startDate",
             end_date::text AS "endDate", status, reason, created_at AS "createdAt"
      FROM leave_requests WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/p2/leave-requests", { perm: "hr:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        employeeId: uuid,
        leaveType: z.string().min(1).max(60),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().max(300).optional(),
      }),
    );
    if (b.startDate > b.endDate) throw new HttpError(422, "Tanggal mulai setelah tanggal selesai.");
    const ins = await tx.execute(sql`
      INSERT INTO leave_requests (workspace_id, employee_id, leave_type, start_date, end_date, reason)
      VALUES (${ctx.workspaceId}, ${b.employeeId}, ${b.leaveType}, ${b.startDate}::date, ${b.endDate}::date, ${b.reason ?? null})
      RETURNING id, status
    `);
    return ins.rows[0];
  }),

  r("POST", "/p2/leave-requests/:id/decide", { perm: "hr:write" }, async ({ ctx, tx, params, json }) => {
    const { status } = await json(z.object({ status: z.enum(["approved", "rejected"]) }));
    const up = await tx.execute(sql`
      UPDATE leave_requests SET status = ${status} WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} RETURNING id, status
    `);
    if (!up.rows.length) throw new HttpError(404, "Pengajuan cuti tidak ditemukan.");
    return up.rows[0];
  }),

  r("GET", "/p2/shifts", { perm: "hr:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, employee_id AS "employeeId", shift_date::text AS "shiftDate", start_time AS "startTime",
             end_time AS "endTime", overtime_minutes AS "overtimeMinutes", note
      FROM shifts WHERE workspace_id = ${ctx.workspaceId} ORDER BY shift_date DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/p2/shifts", { perm: "hr:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        employeeId: uuid,
        shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().min(4).max(10),
        endTime: z.string().min(4).max(10),
        overtimeMinutes: z.coerce.number().int().min(0).default(0),
        note: z.string().max(200).optional(),
      }),
    );
    const ins = await tx.execute(sql`
      INSERT INTO shifts (workspace_id, employee_id, shift_date, start_time, end_time, overtime_minutes, note)
      VALUES (${ctx.workspaceId}, ${b.employeeId}, ${b.shiftDate}::date, ${b.startTime}, ${b.endTime}, ${b.overtimeMinutes}, ${b.note ?? null})
      RETURNING id
    `);
    return ins.rows[0];
  }),

  r("GET", "/p2/payroll-runs", { perm: "hr:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, period_month AS "periodMonth", status, total_gross::text AS "totalGross",
             total_deductions::text AS "totalDeductions", total_net::text AS "totalNet", items, created_at AS "createdAt"
      FROM payroll_runs WHERE workspace_id = ${ctx.workspaceId} ORDER BY period_month DESC LIMIT 36
    `);
    return { items: res.rows };
  }),

  // Payroll dihitung di SERVER dari data karyawan + absensi. Klien hanya memilih periode, kebijakan, dan input manual berlabel.
  r("POST", "/p2/payroll-runs", { perm: "hr:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        periodMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        absence: z.discriminatedUnion("mode", [
          z.object({ mode: z.literal("none") }),
          z.object({ mode: z.literal("per_working_day"), workingDays: z.number().int().min(1).max(31) }),
        ]).default({ mode: "none" }),
        employeeIds: z.array(uuid).max(500).optional(),
        adjustments: z.array(z.object({
          employeeId: uuid, kind: z.enum(["allowance", "deduction"]), label: z.string().min(1).max(60),
          amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        })).max(1000).default([]),
      }),
    );
    const [y, m] = b.periodMonth.split("-").map(Number);
    const start = `${b.periodMonth}-01`;
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const emps = (await tx.execute(sql`
      SELECT id, name, salary::text AS salary FROM employees
      WHERE workspace_id = ${ctx.workspaceId} AND status = 'active' AND (hire_date IS NULL OR hire_date <= ${end}::date)
      ORDER BY name`)).rows as { id: string; name: string; salary: string | null }[];
    const chosen = b.employeeIds ? emps.filter((e) => b.employeeIds!.includes(e.id)) : emps;
    if (b.employeeIds && chosen.length !== new Set(b.employeeIds).size) throw new HttpError(422, "Ada karyawan yang tidak valid untuk workspace ini.", "employee_invalid");
    const ids = new Set(chosen.map((e) => e.id));
    for (const a of b.adjustments) if (!ids.has(a.employeeId)) throw new HttpError(422, "Penyesuaian merujuk karyawan yang tidak termasuk run ini.", "employee_invalid");
    const withSalary = chosen.filter((e) => e.salary && toCents(e.salary) > 0n);
    if (!withSalary.length) throw new HttpError(422, "Tidak ada karyawan aktif dengan gaji pokok terisi pada periode ini.", "no_employees");
    const absent = (await tx.execute(sql`
      SELECT employee_id AS id, count(*)::int AS n FROM attendance
      WHERE workspace_id = ${ctx.workspaceId} AND work_date BETWEEN ${start}::date AND ${end}::date AND status = 'alpa'
      GROUP BY employee_id`)).rows as { id: string; n: number }[];
    const absentBy = new Map(absent.map((x) => [x.id, x.n]));
    const items = [];
    let tg = 0n, td = 0n, tn = 0n;
    try {
      for (const e of withSalary) {
        const res = calcPayroll({
          salaryCents: toCents(e.salary!),
          allowances: b.adjustments.filter((a) => a.employeeId === e.id && a.kind === "allowance").map((a) => ({ label: a.label, amountCents: toCents(a.amount) })),
          manualDeductions: b.adjustments.filter((a) => a.employeeId === e.id && a.kind === "deduction").map((a) => ({ label: a.label, amountCents: toCents(a.amount) })),
          absentDays: absentBy.get(e.id) ?? 0,
          policy: b.absence,
        });
        tg += res.grossCents; td += res.deductionsCents; tn += res.netCents;
        items.push({
          employeeId: e.id, name: e.name, baseSalary: res.baseSalaryCents.toString(), allowances: res.allowancesCents.toString(),
          gross: res.grossCents.toString(), absentDays: res.absentDays, absenceDeduction: res.absenceDeductionCents.toString(),
          manualDeductions: res.manualDeductionsCents.toString(), deductions: res.deductionsCents.toString(), net: res.netCents.toString(), trace: res.trace,
        });
      }
    } catch (e) {
      if (e instanceof PayrollError) throw new HttpError(422, e.message, "payroll_invalid");
      throw e;
    }
    const ins = await tx.execute(sql`
      INSERT INTO payroll_runs (workspace_id, period_month, status, total_gross, total_deductions, total_net, items, policy, created_by)
      VALUES (${ctx.workspaceId}, ${b.periodMonth}, 'draft', ${tg.toString()}, ${td.toString()}, ${tn.toString()}, ${JSON.stringify(items)}::jsonb, ${JSON.stringify(b.absence)}::jsonb, ${ctx.userId ?? ctx.deviceId})
      RETURNING id, period_month AS "periodMonth", status, total_gross::text AS "totalGross", total_deductions::text AS "totalDeductions", total_net::text AS "totalNet"`);
    const row = ins.rows[0] as { id: string };
    await audit(tx, ctx, "payroll.calculate", "payroll_run", row.id, { periodMonth: b.periodMonth, employees: items.length });
    return row;
  }),

  r("POST", "/p2/payroll-runs/:id/post", { perm: "finance:approve" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Payroll tidak ditemukan.");
    const run = (await tx.execute(sql`SELECT id, period_month, status, items FROM payroll_runs WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} FOR UPDATE`)).rows[0] as
      { id: string; period_month: string; status: string; items: { gross: string; absenceDeduction: string; manualDeductions: string; net: string }[] } | undefined;
    if (!run) throw new HttpError(404, "Payroll tidak ditemukan.");
    if (run.status !== "draft") throw new HttpError(409, "Hanya payroll draft yang dapat diposting.", "bad_transition");
    // total dihitung ulang dari item agar jurnal selalu konsisten dengan rincian
    let gross = 0n, absence = 0n, manual = 0n, net = 0n;
    for (const it of run.items) { gross += BigInt(it.gross); absence += BigInt(it.absenceDeduction); manual += BigInt(it.manualDeductions); net += BigInt(it.net); }
    const exp = await ensureSystemAccount(tx as Tx, ctx, { subtype: "payroll_expense", code: "6102", name: "Beban Gaji", type: "expense" });
    const pay = await ensureSystemAccount(tx as Tx, ctx, { subtype: "payroll_payable", code: "2102", name: "Utang Gaji", type: "liability" });
    const lines = [{ accountId: exp, debit: fromCents(gross - absence) }, { accountId: pay, credit: fromCents(net) }];
    if (manual > 0n) {
      const ded = await ensureSystemAccount(tx as Tx, ctx, { subtype: "payroll_deductions", code: "2103", name: "Utang Potongan Gaji", type: "liability" });
      lines.push({ accountId: ded, credit: fromCents(manual) });
    }
    const date = new Date(Date.UTC(Number(run.period_month.slice(0, 4)), Number(run.period_month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const je = await postJournal(tx as Tx, ctx, { date, memo: `Gaji ${run.period_month}`, source: "payroll", sourceId: run.id, lines });
    await tx.execute(sql`UPDATE payroll_runs SET status = 'posted', journal_entry_id = ${je}, posted_at = now() WHERE id = ${run.id}`);
    await audit(tx, ctx, "payroll.post", "payroll_run", run.id, { journalId: je, net: net.toString() });
    return { ok: true, journalEntryId: je };
  }),

  r("POST", "/p2/payroll-runs/:id/reverse", { perm: "finance:approve" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Payroll tidak ditemukan.");
    const run = (await tx.execute(sql`SELECT id, period_month, status, journal_entry_id AS je FROM payroll_runs WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} FOR UPDATE`)).rows[0] as
      { id: string; period_month: string; status: string; je: string | null } | undefined;
    if (!run) throw new HttpError(404, "Payroll tidak ditemukan.");
    if (run.status === "draft") {
      await tx.execute(sql`UPDATE payroll_runs SET status = 'cancelled' WHERE id = ${run.id}`);
      await audit(tx, ctx, "payroll.cancel", "payroll_run", run.id, {});
      return { ok: true, status: "cancelled" };
    }
    if (run.status !== "posted" || !run.je) throw new HttpError(409, "Payroll ini tidak dapat dibalik.", "bad_transition");
    const date = new Date(Date.UTC(Number(run.period_month.slice(0, 4)), Number(run.period_month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const rev = await reverseJournal(tx as Tx, ctx, run.je, date, `Pembalikan gaji ${run.period_month}`);
    await tx.execute(sql`UPDATE payroll_runs SET status = 'reversed', reversal_entry_id = ${rev} WHERE id = ${run.id}`);
    await audit(tx, ctx, "payroll.reverse", "payroll_run", run.id, { reversalId: rev });
    return { ok: true, status: "reversed", reversalEntryId: rev };
  }),

  r("GET", "/p2/payroll-runs/:id/slip/:employeeId", { perm: "hr:read" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success || !uuid.safeParse(params.employeeId).success) throw new HttpError(404, "Slip tidak ditemukan.");
    const run = (await tx.execute(sql`SELECT period_month AS "periodMonth", status, items FROM payroll_runs WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId}`)).rows[0] as
      { periodMonth: string; status: string; items: { employeeId: string }[] } | undefined;
    const item = run?.items.find((i) => i.employeeId === params.employeeId);
    if (!run || !item) throw new HttpError(404, "Slip tidak ditemukan.");
    return { periodMonth: run.periodMonth, status: run.status, item };
  }),

  /* ───────── 5. Task Comments & Checklists ───────── */
  r("GET", "/p2/tasks/:id/comments", { perm: "tasks:read" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Tugas tidak ditemukan.");
    const res = await tx.execute(sql`
      SELECT id, author, body, checklist, created_at AS "createdAt"
      FROM task_comments WHERE workspace_id = ${ctx.workspaceId} AND task_id = ${params.id}
      ORDER BY created_at ASC
    `);
    return { items: res.rows };
  }),

  r("POST", "/p2/tasks/:id/comments", { perm: "tasks:write" }, async ({ ctx, tx, params, json }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Tugas tidak ditemukan.");
    const b = await json(
      z.object({
        body: z.string().min(1).max(1000),
        checklist: z.array(z.object({ label: z.string().min(1), done: z.boolean() })).default([]),
      }),
    );
    const ins = await tx.execute(sql`
      INSERT INTO task_comments (workspace_id, task_id, author, body, checklist)
      VALUES (${ctx.workspaceId}, ${params.id}, ${ctx.operator ?? ctx.deviceName}, ${b.body}, ${JSON.stringify(b.checklist)}::jsonb)
      RETURNING id, created_at AS "createdAt"
    `);
    return ins.rows[0];
  }),

  /* ───────── 6. Bank Reconciliation & Credit Notes ───────── */
  r("GET", "/p2/bank-reconciliations", { perm: "finance:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, account_id AS "accountId", statement_date::text AS "statementDate",
             statement_balance::text AS "statementBalance", book_balance::text AS "bookBalance",
             difference::text, status, note, created_at AS "createdAt"
      FROM bank_reconciliations WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 50
    `);
    return { items: res.rows };
  }),

  r("POST", "/p2/bank-reconciliations", { perm: "finance:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        accountId: uuid,
        statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        statementBalance: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
        bookBalance: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
        note: z.string().max(300).optional(),
      }),
    );
    const stmtCents = toCents(b.statementBalance.replace(/^-/, "")) * (b.statementBalance.startsWith("-") ? -1n : 1n);
    const bookCents = toCents(b.bookBalance.replace(/^-/, "")) * (b.bookBalance.startsWith("-") ? -1n : 1n);
    const diff = stmtCents - bookCents;
    const status = diff === 0n ? "reconciled" : "unbalanced";
    const ins = await tx.execute(sql`
      INSERT INTO bank_reconciliations (workspace_id, account_id, statement_date, statement_balance, book_balance, difference, status, note)
      VALUES (${ctx.workspaceId}, ${b.accountId}, ${b.statementDate}::date, ${stmtCents.toString()}, ${bookCents.toString()}, ${diff.toString()}, ${status}, ${b.note ?? null})
      RETURNING id, difference::text, status
    `);
    await audit(tx, ctx, "finance.reconcile", "bank_reconciliation", String((ins.rows[0] as { id: string }).id), { status });
    return ins.rows[0];
  }),

  r("GET", "/p2/credit-notes", { perm: "finance:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, number, invoice_id AS "invoiceId", client_id AS "clientId", amount::text, reason, status, created_at AS "createdAt"
      FROM credit_notes WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/p2/credit-notes", { perm: "finance:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        invoiceId: uuid.optional(),
        clientId: uuid.optional(),
        amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        reason: z.string().min(1).max(300),
      }),
    );
    const amt = toCents(b.amount);
    if (amt <= 0n) throw new HttpError(422, "Nominal credit note harus lebih dari nol.");
    const number = await nextNumber(tx, ctx.workspaceId, "credit_note", "CN");
    const ins = await tx.execute(sql`
      INSERT INTO credit_notes (workspace_id, number, invoice_id, client_id, amount, reason)
      VALUES (${ctx.workspaceId}, ${number}, ${b.invoiceId ?? null}, ${b.clientId ?? null}, ${amt.toString()}, ${b.reason})
      RETURNING id, number, status
    `);
    await audit(tx, ctx, "credit_note.create", "credit_note", String((ins.rows[0] as { id: string }).id), { number });
    return ins.rows[0];
  }),

  /* ───────── 7. Import / Migration / Reconciliation Center (CSV + Rollback) ───────── */
  r("GET", "/p2/imports", { perm: "settings:write" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, target, filename, total_rows AS "totalRows", imported_rows AS "importedRows",
             error_rows AS "errorRows", status, errors, created_at AS "createdAt"
      FROM import_batches WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 50
    `);
    return { items: res.rows };
  }),

  r("POST", "/p2/imports/commit", { perm: "settings:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        target: z.string().refine((v) => (IMPORT_TARGET_KEYS as string[]).includes(v), "Target impor tidak dikenal."),
        filename: z.string().min(1).max(150),
        rows: z.array(z.record(z.string(), z.string())).min(1).max(1000),
      }),
    );
    const errors: { row: number; message: string }[] = [];
    const insertedIds: string[] = [];

    for (let i = 0; i < b.rows.length; i++) {
      const row = b.rows[i];
      const invalid = validateImportRow(b.target, row);
      if (invalid) {
        errors.push({ row: i + 1, message: invalid });
        continue;
      }
      insertedIds.push(await insertImportRow(tx, ctx, b.target, row));
    }

    const batch = await tx.execute(sql`
      INSERT INTO import_batches (workspace_id, target, filename, total_rows, imported_rows, error_rows, inserted_ids, errors)
      VALUES (${ctx.workspaceId}, ${b.target}, ${b.filename}, ${b.rows.length}, ${insertedIds.length}, ${errors.length},
              ${JSON.stringify(insertedIds)}::jsonb, ${JSON.stringify(errors)}::jsonb)
      RETURNING id, total_rows AS "totalRows", imported_rows AS "importedRows", error_rows AS "errorRows", status, errors
    `);
    await audit(tx, ctx, "import.commit", "import_batch", String((batch.rows[0] as { id: string }).id), {
      target: b.target,
      imported: insertedIds.length,
    });
    return batch.rows[0];
  }),

  r("POST", "/p2/imports/:id/rollback", { perm: "settings:write" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Batch impor tidak ditemukan.");
    const res = await tx.execute(sql`
      SELECT id, target, status, inserted_ids FROM import_batches
      WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} LIMIT 1
    `);
    const batch = res.rows[0] as { id: string; target: string; status: string; inserted_ids: string[] } | undefined;
    if (!batch) throw new HttpError(404, "Batch impor tidak ditemukan.");
    if (batch.status === "rolled_back") throw new HttpError(409, "Batch sudah di-rollback sebelumnya.");

    const rolledBackCount = await rollbackImportRows(tx, ctx.workspaceId, batch.target, batch.inserted_ids ?? []);
    await tx.execute(sql`UPDATE import_batches SET status = 'rolled_back' WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId}`);
    await audit(tx, ctx, "import.rollback", "import_batch", params.id);
    return { ok: true, rolledBackCount };
  }),

  /* ───────── 8. Privacy DSR Management ───────── */
  r("GET", "/p2/privacy/dsr", { perm: "settings:write" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, subject_name AS "subjectName", request_type AS "requestType", status, notes, created_at AS "createdAt"
      FROM data_subject_requests WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/p2/privacy/dsr", { perm: "settings:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        subjectName: z.string().min(1).max(120),
        requestType: z.enum(["access", "rectification", "erasure", "restriction"]),
        notes: z.string().max(400).optional(),
      }),
    );
    const ins = await tx.execute(sql`
      INSERT INTO data_subject_requests (workspace_id, subject_name, request_type, notes)
      VALUES (${ctx.workspaceId}, ${b.subjectName}, ${b.requestType}, ${b.notes ?? null})
      RETURNING id, status
    `);
    await audit(tx, ctx, "privacy.dsr_create", "data_subject_request", String((ins.rows[0] as { id: string }).id));
    return ins.rows[0];
  }),
];
