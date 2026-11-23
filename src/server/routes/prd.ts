import { sql } from "drizzle-orm";
import { z } from "zod";
import { fromCents, fromMilli, mulQty, toCents, toMilli } from "@/lib/money";
import { audit, getBusiness, HttpError, idempotent, nextNumber, r, todayIn, type DB, type Route, type Tx } from "../core";
import { accountBySubtype, ensureSystemAccount, postJournal, reverseJournal } from "../accounting";
import { cashVariance, expectedCash, straightLineDepreciation } from "../engine/metrics";
import { weightedAvg } from "./sales";

const uuid = z.string().uuid();


const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periode harus YYYY-MM");
const lastDayOfMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Hitung penyusutan sebulan. lock=true mengunci baris aset (FOR UPDATE) agar tidak balapan. */
export async function computeDepreciation(tx: DB, workspaceId: string, assetId: string, period: string, lock: boolean) {
  const cur = await tx.execute(lock
    ? sql`SELECT name, acquisition_cost_cents::text AS acq, residual_value_cents::text AS res, useful_life_months AS life, method,
             accumulated_dep_cents::text AS acc, book_value_cents::text AS bv, acquisition_date::text AS acqdate
          FROM fixed_assets WHERE id = ${assetId} AND workspace_id = ${workspaceId} FOR UPDATE`
    : sql`SELECT name, acquisition_cost_cents::text AS acq, residual_value_cents::text AS res, useful_life_months AS life, method,
             accumulated_dep_cents::text AS acc, book_value_cents::text AS bv, acquisition_date::text AS acqdate
          FROM fixed_assets WHERE id = ${assetId} AND workspace_id = ${workspaceId}`);
  const a = cur.rows[0] as { name: string; acq: string; res: string; life: number; method: string; acc: string; bv: string; acqdate: string } | undefined;
  if (!a) throw new HttpError(404, "Aset tidak ditemukan.");
  if (period < a.acqdate.slice(0, 7)) throw new HttpError(422, "Periode sebelum tanggal perolehan aset.", "before_acquisition");
  const dup = await tx.execute(sql`SELECT 1 FROM asset_depreciation_logs WHERE asset_id = ${assetId} AND period_month = ${period} AND workspace_id = ${workspaceId} AND status = 'posted' LIMIT 1`);
  if (dup.rows.length) throw new HttpError(409, `Penyusutan periode ${period} sudah diposting.`, "conflict");
  const cnt = await tx.execute(sql`SELECT count(*)::int AS n FROM asset_depreciation_logs WHERE asset_id = ${assetId} AND workspace_id = ${workspaceId} AND status = 'posted'`);
  const posted = (cnt.rows[0] as { n: number }).n;
  const bv = BigInt(a.bv), resVal = BigInt(a.res), acq = BigInt(a.acq), life = BigInt(a.life);
  if (bv <= resVal) throw new HttpError(422, "Nilai buku sudah mencapai nilai residu.", "fully_depreciated");
  let dep: bigint;
  if (a.method === "declining_balance") {
    dep = (bv * 2n) / life;
    if (dep <= 0n) dep = 1n;
    if (posted + 1 >= Number(life) || bv - dep < resVal) dep = bv - resVal; // periode terakhir menutup sisa pembulatan
  } else {
    // Calculation Engine: periode terakhir menutup sisa, tidak melampaui nilai buku/residu.
    const calc = straightLineDepreciation({
      acquisition: acq, residual: resVal, usefulLifeMonths: Number(life),
      monthsElapsed: posted, accumulated: BigInt(a.acc), bookValue: bv,
    });
    if (calc.cents === null) throw new HttpError(422, "Penyusutan tidak dapat dihitung: data aset tidak lengkap.", calc.reason);
    dep = calc.cents;
    if (dep <= 0n) throw new HttpError(422, "Tidak ada nilai yang dapat disusutkan pada periode ini.", "fully_depreciated");
  }
  return {
    assetName: a.name, periodMonth: period, method: a.method, amountCents: dep.toString(),
    bookValueAfterCents: (bv - dep).toString(), accumulatedAfterCents: (BigInt(a.acc) + dep).toString(),
  };
}

export const prdRoutes: Route[] = [
  /* ───────── 1. Cashier Shift & Table Management (POS-01..07) ───────── */
  r("GET", "/prd/shifts", { perm: "sales:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, operator, opening_cash::text AS "openingCash", cash_in::text AS "cashIn",
             cash_out::text AS "cashOut", cash_sales::text AS "cashSales", cash_refunds::text AS "cashRefunds",
             expected_cash::text AS "expectedCash", counted_cash::text AS "countedCash",
             variance::text, status, note, opened_at AS "openedAt", closed_at AS "closedAt"
      FROM cashier_shifts WHERE workspace_id = ${ctx.workspaceId} ORDER BY opened_at DESC LIMIT 50
    `);
    return { items: res.rows };
  }),

  r("POST", "/prd/shifts/open", { perm: "sales:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        openingCash: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        note: z.string().max(300).optional(),
      }),
    );
    const openExisting = await tx.execute(sql`
      SELECT id FROM cashier_shifts WHERE workspace_id = ${ctx.workspaceId} AND status = 'open' LIMIT 1
    `);
    if (openExisting.rows.length > 0) throw new HttpError(409, "Masih ada shift kasir yang terbuka. Tutup shift aktif terlebih dahulu.");
    const openCents = toCents(b.openingCash);
    const ins = await tx.execute(sql`
      INSERT INTO cashier_shifts (workspace_id, branch_id, device_id, operator, opening_cash, expected_cash, note)
      VALUES (${ctx.workspaceId}, ${ctx.branchId}, ${ctx.deviceId}, ${ctx.operator ?? ctx.deviceName}, ${openCents.toString()}, ${openCents.toString()}, ${b.note ?? null})
      RETURNING id, status, opening_cash::text AS "openingCash"
    `);
    await audit(tx, ctx, "pos.shift_open", "cashier_shift", String((ins.rows[0] as { id: string }).id));
    return ins.rows[0];
  }),

  r("POST", "/prd/shifts/:id/close", { perm: "sales:write" }, async ({ ctx, tx, params, json }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Shift tidak ditemukan.");
    const b = await json(
      z.object({
        countedCash: z.string().regex(/^\d+(\.\d{1,2})?$/),
        cashIn: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        cashOut: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        note: z.string().max(300).optional(),
      }),
    );
    const cur = await tx.execute(sql`
      SELECT id, opening_cash::text AS "openingCash", cash_sales::text AS "cashSales", cash_refunds::text AS "cashRefunds", status
      FROM cashier_shifts WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} LIMIT 1
    `);
    const row = cur.rows[0] as { openingCash: string; cashSales: string; cashRefunds: string; status: string } | undefined;
    if (!row) throw new HttpError(404, "Shift tidak ditemukan.");
    if (row.status === "closed") throw new HttpError(409, "Shift sudah ditutup.");

    const cashInCents = toCents(b.cashIn);
    const cashOutCents = toCents(b.cashOut);
    const countedCents = toCents(b.countedCash);
    const expected = expectedCash({
      openingFloat: BigInt(row.openingCash),
      cashSales: BigInt(row.cashSales),
      cashIn: cashInCents,
      cashOut: cashOutCents,
      cashRefunds: BigInt(row.cashRefunds),
    });
    if (expected.cents === null) throw new HttpError(422, "Kas diharapkan tidak dapat dihitung.", expected.reason);
    const expectedCents = expected.cents;
    const variance = cashVariance(countedCents, expected);
    const varianceCents = variance.cents ?? 0n;

    const up = await tx.execute(sql`
      UPDATE cashier_shifts
      SET cash_in = ${cashInCents.toString()}, cash_out = ${cashOutCents.toString()},
          expected_cash = ${expectedCents.toString()}, counted_cash = ${countedCents.toString()},
          variance = ${varianceCents.toString()}, status = 'closed',
          note = COALESCE(${b.note ?? null}, note), closed_at = now()
      WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId}
      RETURNING id, expected_cash::text AS "expectedCash", counted_cash::text AS "countedCash", variance::text, status
    `);
    await audit(tx, ctx, "pos.shift_close", "cashier_shift", params.id, { variance: varianceCents.toString() });
    return up.rows[0];
  }),

  r("GET", "/prd/tables", { perm: "sales:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, code, name, capacity, status, active_note AS "activeNote", updated_at AS "updatedAt"
      FROM pos_tables WHERE workspace_id = ${ctx.workspaceId} ORDER BY code ASC
    `);
    return { items: res.rows };
  }),

  r("POST", "/prd/tables", { perm: "sales:write" }, async ({ ctx, tx, json }) => {
    const b = await json(z.object({ code: z.string().min(1).max(20), name: z.string().min(1).max(60), capacity: z.coerce.number().int().min(1).max(100).default(4) }));
    const ins = await tx.execute(sql`
      INSERT INTO pos_tables (workspace_id, branch_id, code, name, capacity)
      VALUES (${ctx.workspaceId}, ${ctx.branchId}, ${b.code}, ${b.name}, ${b.capacity})
      RETURNING id, code, name, capacity, status
    `);
    return ins.rows[0];
  }),

  r("PATCH", "/prd/tables/:id", { perm: "sales:write" }, async ({ ctx, tx, params, json }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Meja tidak ditemukan.");
    const b = await json(z.object({ status: z.enum(["available", "occupied", "reserved"]), activeNote: z.string().max(120).optional() }));
    const up = await tx.execute(sql`
      UPDATE pos_tables SET status = ${b.status}, active_note = ${b.activeNote ?? null}, updated_at = now()
      WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId}
      RETURNING id, status, active_note AS "activeNote"
    `);
    if (!up.rows.length) throw new HttpError(404, "Meja tidak ditemukan.");
    return up.rows[0];
  }),

  /* ───────── 2. Product Batches, Serial, Expiry & Waste (INV-11..15) ───────── */
  r("GET", "/prd/batches", { perm: "inventory:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, product_id AS "productId", warehouse_id AS "warehouseId", batch_no AS "batchNo",
             serial_no AS "serialNo", qty_milli::text AS "qtyMilli", expiry_date::text AS "expiryDate",
             cost_cents::text AS "costCents", status, created_at AS "createdAt"
      FROM product_batches WHERE workspace_id = ${ctx.workspaceId} ORDER BY expiry_date ASC NULLS LAST, created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/prd/batches", { perm: "inventory:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        productId: uuid,
        warehouseId: uuid.optional(),
        batchNo: z.string().min(1).max(60),
        serialNo: z.string().max(80).optional(),
        qty: z.coerce.number().min(0),
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        cost: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
      }),
    );
    const ins = await tx.execute(sql`
      INSERT INTO product_batches (workspace_id, product_id, warehouse_id, batch_no, serial_no, qty_milli, expiry_date, cost_cents)
      VALUES (${ctx.workspaceId}, ${b.productId}, ${b.warehouseId ?? null}, ${b.batchNo}, ${b.serialNo ?? null},
              ${Math.round(b.qty * 1000)}, ${b.expiryDate ? sql`${b.expiryDate}::date` : sql`NULL`}, ${toCents(b.cost).toString()})
      RETURNING id, batch_no AS "batchNo", status
    `);
    return ins.rows[0];
  }),

  r("GET", "/prd/waste", { perm: "inventory:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, product_id AS "productId", warehouse_id AS "warehouseId", qty_milli::text AS "qtyMilli",
             reason, cost_cents::text AS "costCents", operator, created_at AS "createdAt"
      FROM stock_waste WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/prd/waste", { perm: "inventory:write" }, async ({ ctx, tx, json, idemKey }) => {
    const b = await json(
      z.object({
        productId: uuid,
        warehouseId: uuid.optional(),
        qty: z.string().regex(/^\d+(\.\d{1,3})?$/, "Jumlah harus angka desimal (maks 3 digit)"),
        reason: z.string().min(1).max(200),
      }),
    );
    return idempotent(tx as Tx, ctx, idemKey, async () => {
      const qty = toMilli(b.qty);
      if (qty <= 0n) throw new HttpError(422, "Jumlah waste harus lebih dari 0.", "validation");
      // Kunci baris produk: dua waste paralel tidak boleh sama-sama lolos cek stok.
      const prodRes = await tx.execute(sql`
        SELECT id, name, track_stock AS "trackStock", avg_cost::text AS "avgCost" FROM products
        WHERE id = ${b.productId} AND workspace_id = ${ctx.workspaceId} FOR UPDATE`);
      const prod = prodRes.rows[0] as { id: string; name: string; trackStock: boolean; avgCost: string } | undefined;
      if (!prod) throw new HttpError(404, "Produk tidak ditemukan.");
      if (!prod.trackStock) throw new HttpError(422, "Produk ini tidak melacak stok.", "not_tracked");
      let whId = b.warehouseId;
      if (whId) {
        const own = await tx.execute(sql`SELECT 1 FROM warehouses WHERE id = ${whId} AND workspace_id = ${ctx.workspaceId}`);
        if (!own.rows.length) throw new HttpError(404, "Gudang tidak ditemukan.");
      } else {
        const whRes = await tx.execute(sql`SELECT id FROM warehouses WHERE workspace_id = ${ctx.workspaceId} ORDER BY is_default DESC, created_at ASC LIMIT 1`);
        whId = (whRes.rows[0] as { id: string } | undefined)?.id;
      }
      if (!whId) throw new HttpError(422, "Gudang belum dikonfigurasi di workspace ini.");
      const stockRes = await tx.execute(sql`
        SELECT COALESCE(SUM(quantity), 0)::text AS s FROM stock_movements
        WHERE workspace_id = ${ctx.workspaceId} AND warehouse_id = ${whId} AND product_id = ${b.productId}`);
      const have = toMilli((stockRes.rows[0] as { s: string }).s);
      if (have < qty) throw new HttpError(409, `Stok gudang tidak mencukupi untuk waste (tersedia ${fromMilli(have)}, diminta ${b.qty}).`, "insufficient_stock");
      // Biaya = biaya rata-rata produk di server (bukan angka dari klien).
      const value = mulQty(b.qty, prod.avgCost);
      const ins = await tx.execute(sql`
        INSERT INTO stock_waste (workspace_id, product_id, warehouse_id, qty_milli, reason, cost_cents, operator)
        VALUES (${ctx.workspaceId}, ${b.productId}, ${whId}, ${qty.toString()}, ${b.reason}, ${value.toString()}, ${ctx.operator ?? ctx.deviceName})
        RETURNING id`);
      const wasteId = String((ins.rows[0] as { id: string }).id);
      await tx.execute(sql`
        INSERT INTO stock_movements (workspace_id, business_id, warehouse_id, product_id, quantity, unit_cost, kind, ref_type, ref_id, note, device_id)
        VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${whId}, ${b.productId}, ${fromMilli(-qty)}::numeric, ${prod.avgCost}::numeric,
          'waste', 'stock_waste', ${wasteId}::uuid, ${"Waste/Kerusakan: " + b.reason}, ${ctx.deviceId})`);
      if (value > 0n) {
        const biz = await getBusiness(tx, ctx);
        const inv = await accountBySubtype(tx as Tx, ctx.workspaceId, "inventory");
        const loss = await accountBySubtype(tx as Tx, ctx.workspaceId, "variance");
        await postJournal(tx as Tx, ctx, {
          date: todayIn(biz.timezone), memo: `Waste ${prod.name}`, source: "stock_waste", sourceId: wasteId,
          lines: [{ accountId: loss, debit: fromCents(value) }, { accountId: inv, credit: fromCents(value) }],
        });
      }
      await audit(tx, ctx, "stock.waste", "stock_waste", wasteId, { reason: b.reason, qty: b.qty, value: value.toString() });
      return { id: wasteId, valueCents: value.toString() };
    });
  }),

  /* ───────── 3. Recipe, BOM & Work Orders (PRD-01..17) ───────── */
  r("GET", "/prd/recipes", { perm: "inventory:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, product_id AS "productId", version, name, yield_qty::text AS "yieldQty", yield_unit AS "yieldUnit",
             ingredients, is_active AS "isActive", created_at AS "createdAt"
      FROM recipes WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/prd/recipes", { perm: "inventory:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        productId: uuid.optional(),
        name: z.string().min(1).max(120),
        yieldQty: z.coerce.number().positive().default(1),
        yieldUnit: z.string().min(1).max(20).default("pcs"),
        ingredients: z.array(z.object({
          name: z.string().min(1),
          qty: z.coerce.number().positive(),
          unit: z.string().default("gr"),
          productId: uuid.optional(),
        })).min(1),
      }),
    );
    const ins = await tx.execute(sql`
      INSERT INTO recipes (workspace_id, product_id, name, yield_qty, yield_unit, ingredients)
      VALUES (${ctx.workspaceId}, ${b.productId ?? null}, ${b.name}, ${String(b.yieldQty)}::numeric, ${b.yieldUnit}, ${JSON.stringify(b.ingredients)}::jsonb)
      RETURNING id, name, version
    `);
    return ins.rows[0];
  }),

  r("GET", "/prd/work-orders", { perm: "inventory:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, number, recipe_id AS "recipeId", product_id AS "productId", planned_qty::text AS "plannedQty", actual_qty::text AS "actualQty",
             waste_qty::text AS "wasteQty", labor_cost_cents::text AS "laborCostCents",
             overhead_cost_cents::text AS "overheadCostCents", total_cost_cents::text AS "totalCostCents",
             status, created_at AS "createdAt", completed_at AS "completedAt"
      FROM work_orders WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/prd/work-orders", { perm: "inventory:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        recipeId: uuid.optional(),
        productId: uuid.optional(),
        warehouseId: uuid.optional(),
        plannedQty: z.coerce.number().positive(),
        laborCost: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        overheadCost: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
      }),
    );
    const number = await nextNumber(tx, ctx.workspaceId, "work_order", "WO");
    const laborCents = toCents(b.laborCost);
    const overCents = toCents(b.overheadCost);
    const ins = await tx.execute(sql`
      INSERT INTO work_orders (workspace_id, number, recipe_id, product_id, planned_qty, labor_cost_cents, overhead_cost_cents, total_cost_cents)
      VALUES (${ctx.workspaceId}, ${number}, ${b.recipeId ?? null}, ${b.productId ?? null}, ${String(b.plannedQty)}::numeric,
              ${laborCents.toString()}, ${overCents.toString()}, ${(laborCents + overCents).toString()})
      RETURNING id, number, status
    `);
    return ins.rows[0];
  }),

  // Produksi: bahan dikonsumsi pada biaya rata-rata (dicek ketersediaannya), hasil jadi bernilai = biaya bahan yang terserap,
  // biaya bahan untuk porsi waste menjadi kerugian (jurnal: beban selisih D / persediaan K). Semua BigInt.
  r("POST", "/prd/work-orders/:id/complete", { perm: "inventory:write" }, async ({ ctx, tx, params, json, idemKey }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Work Order tidak ditemukan.");
    const b = await json(z.object({
      actualQty: z.string().regex(/^\d+(\.\d{1,3})?$/),
      wasteQty: z.string().regex(/^\d+(\.\d{1,3})?$/).default("0"),
      warehouseId: uuid.optional(),
    }));
    return idempotent(tx as Tx, ctx, idemKey, async () => {
      const actual = toMilli(b.actualQty), waste = toMilli(b.wasteQty);
      if (actual + waste <= 0n) throw new HttpError(422, "Jumlah hasil atau waste harus lebih dari 0.", "validation");
      const woRes = await tx.execute(sql`
        SELECT wo.id, wo.number, wo.product_id AS "productId", r.product_id AS "recipeProductId", r.ingredients, r.yield_qty::text AS "yieldQty"
        FROM work_orders wo LEFT JOIN recipes r ON r.id = wo.recipe_id
        WHERE wo.id = ${params.id} AND wo.workspace_id = ${ctx.workspaceId} AND wo.status <> 'completed' FOR UPDATE OF wo`);
      const wo = woRes.rows[0] as { id: string; number: string; productId: string | null; recipeProductId: string | null;
        ingredients: Array<{ name: string; qty: number | string; productId?: string }> | null; yieldQty: string | null } | undefined;
      if (!wo) throw new HttpError(409, "Work Order tidak ditemukan atau sudah selesai.", "bad_transition");
      let whId = b.warehouseId;
      if (whId) {
        if (!(await tx.execute(sql`SELECT 1 FROM warehouses WHERE id = ${whId} AND workspace_id = ${ctx.workspaceId}`)).rows.length) throw new HttpError(404, "Gudang tidak ditemukan.");
      } else {
        whId = ((await tx.execute(sql`SELECT id FROM warehouses WHERE workspace_id = ${ctx.workspaceId} ORDER BY is_default DESC, created_at ASC LIMIT 1`)).rows[0] as { id: string } | undefined)?.id;
      }
      if (!whId) throw new HttpError(422, "Gudang belum dikonfigurasi di workspace ini.");

      const yieldMilli = toMilli(wo.yieldQty ?? "1") > 0n ? toMilli(wo.yieldQty ?? "1") : 1000n;
      const totalMilli = actual + waste;
      let materialValue = 0n;
      for (const ing of Array.isArray(wo.ingredients) ? wo.ingredients : []) {
        if (!ing.productId) continue; // bahan tanpa produk stok tidak dilacak
        const p = (await tx.execute(sql`SELECT name, avg_cost::text AS "avgCost" FROM products WHERE id = ${ing.productId} AND workspace_id = ${ctx.workspaceId} FOR UPDATE`)).rows[0] as { name: string; avgCost: string } | undefined;
        if (!p) throw new HttpError(422, `Bahan ${ing.name} tidak ditemukan.`, "reference");
        const consume = (toMilli(String(ing.qty)) * totalMilli) / yieldMilli; // milli-unit, dibulatkan ke bawah
        if (consume <= 0n) continue;
        const have = toMilli(((await tx.execute(sql`SELECT COALESCE(SUM(quantity),0)::text AS s FROM stock_movements WHERE workspace_id = ${ctx.workspaceId} AND warehouse_id = ${whId} AND product_id = ${ing.productId}`)).rows[0] as { s: string }).s);
        if (have < consume) throw new HttpError(409, `Stok bahan ${p.name} tidak cukup (perlu ${fromMilli(consume)}, tersedia ${fromMilli(have)}).`, "insufficient_stock");
        materialValue += mulQty(fromMilli(consume), p.avgCost);
        await tx.execute(sql`
          INSERT INTO stock_movements (workspace_id, business_id, warehouse_id, product_id, quantity, unit_cost, kind, ref_type, ref_id, note, device_id)
          VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${whId}, ${ing.productId}, ${fromMilli(-consume)}::numeric, ${p.avgCost}::numeric,
            'production_consume', 'work_order', ${wo.id}::uuid, ${"Konsumsi produksi " + wo.number + ": " + ing.name}, ${ctx.deviceId})`);
      }

      const finishedProdId = wo.productId || wo.recipeProductId;
      let outputValue = 0n;
      if (finishedProdId && actual > 0n) {
        outputValue = (materialValue * actual) / totalMilli; // biaya yang terserap hasil jadi
        const fp = (await tx.execute(sql`SELECT avg_cost::text AS "avgCost" FROM products WHERE id = ${finishedProdId} AND workspace_id = ${ctx.workspaceId} FOR UPDATE`)).rows[0] as { avgCost: string } | undefined;
        if (!fp) throw new HttpError(422, "Produk hasil jadi tidak ditemukan.", "reference");
        const unitCost = (outputValue * 1000n) / actual; // sen per unit
        const haveAll = toMilli(((await tx.execute(sql`SELECT COALESCE(SUM(quantity),0)::text AS s FROM stock_movements WHERE workspace_id = ${ctx.workspaceId} AND product_id = ${finishedProdId}`)).rows[0] as { s: string }).s);
        const newAvg = weightedAvg(haveAll, toCents(fp.avgCost), actual, unitCost);
        await tx.execute(sql`UPDATE products SET avg_cost = ${fromCents(newAvg)}::numeric WHERE id = ${finishedProdId} AND workspace_id = ${ctx.workspaceId}`);
        await tx.execute(sql`
          INSERT INTO stock_movements (workspace_id, business_id, warehouse_id, product_id, quantity, unit_cost, kind, ref_type, ref_id, note, device_id)
          VALUES (${ctx.workspaceId}, ${ctx.businessId}, ${whId}, ${finishedProdId}, ${fromMilli(actual)}::numeric, ${fromCents(unitCost)}::numeric,
            'production_output', 'work_order', ${wo.id}::uuid, ${"Hasil produksi " + wo.number}, ${ctx.deviceId})`);
      }
      // Nilai bahan yang tidak terserap hasil jadi (waste / tanpa produk hasil) = kerugian produksi.
      const loss = materialValue - outputValue;
      if (loss > 0n) {
        const biz = await getBusiness(tx, ctx);
        const inv = await accountBySubtype(tx as Tx, ctx.workspaceId, "inventory");
        const variance = await accountBySubtype(tx as Tx, ctx.workspaceId, "variance");
        await postJournal(tx as Tx, ctx, {
          date: todayIn(biz.timezone), memo: `Kerugian produksi ${wo.number}`, source: "production_loss", sourceId: wo.id,
          lines: [{ accountId: variance, debit: fromCents(loss) }, { accountId: inv, credit: fromCents(loss) }],
        });
      }
      const up = await tx.execute(sql`
        UPDATE work_orders SET actual_qty = ${fromMilli(actual)}::numeric, waste_qty = ${fromMilli(waste)}::numeric, status = 'completed', completed_at = now()
        WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} RETURNING id, number, status`);
      await audit(tx, ctx, "production.complete", "work_order", params.id, { actualQty: b.actualQty, wasteQty: b.wasteQty, materialValue: materialValue.toString(), loss: loss.toString() });
      return up.rows[0];
    });
  }),

  /* ───────── 4. Fixed Assets & Depreciation (AST-01..19) ───────── */
  r("GET", "/prd/assets", { perm: "assets:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, code, name, category, location, responsible, acquisition_date::text AS "acquisitionDate",
             acquisition_cost_cents::text AS "acquisitionCostCents", residual_value_cents::text AS "residualValueCents",
             useful_life_months AS "usefulLifeMonths", method,
             accumulated_dep_cents::text AS "accumulatedDepCents", book_value_cents::text AS "bookValueCents", status
      FROM fixed_assets WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/prd/assets", { perm: "assets:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        name: z.string().min(1).max(120),
        category: z.string().min(1).max(60).default("Peralatan"),
        location: z.string().max(100).optional(),
        responsible: z.string().max(80).optional(),
        acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        acquisitionCost: z.string().regex(/^\d+(\.\d{1,2})?$/),
        // BF-027: nilai residu wajib diisi eksplisit (tanpa default senyap).
        residualValue: z.string().regex(/^\d+(\.\d{1,2})?$/),
        // BF-027: umur manfaat WAJIB diisi pengguna. Default 36 bulan menyembunyikan asumsi
        // akuntansi ke dalam data (ditemukan 2026-11-19).
        usefulLifeMonths: z.coerce.number().int().min(1).max(600),
        // BF-027: metode wajib dipilih; tidak ada default 36 bulan / garis lurus implisit.
        method: z.enum(["straight_line", "declining_balance"]),
      }),
    );
    const acq = toCents(b.acquisitionCost);
    const resVal = toCents(b.residualValue);
    if (resVal > acq) throw new HttpError(422, "Nilai residu tidak boleh melebihi nilai perolehan.");
    const code = await nextNumber(tx, ctx.workspaceId, "fixed_asset", "AST");
    const ins = await tx.execute(sql`
      INSERT INTO fixed_assets (workspace_id, branch_id, code, name, category, location, responsible, acquisition_date,
        acquisition_cost_cents, residual_value_cents, useful_life_months, method, book_value_cents)
      VALUES (${ctx.workspaceId}, ${ctx.branchId}, ${code}, ${b.name}, ${b.category}, ${b.location ?? null}, ${b.responsible ?? null},
              ${b.acquisitionDate}::date, ${acq.toString()}, ${resVal.toString()}, ${b.usefulLifeMonths}, ${b.method}, ${acq.toString()})
      RETURNING id, code, status
    `);
    return ins.rows[0];
  }),

  // Perhitungan murni (dapat diuji): garis lurus / saldo menurun ganda, bulat ke satuan terkecil, periode terakhir menutup sisa.
  r("GET", "/prd/assets/:id/depreciation-preview", { perm: "assets:read" }, async ({ ctx, tx, params, query }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Aset tidak ditemukan.");
    const period = periodSchema.parse(query.get("periodMonth"));
    return computeDepreciation(tx, ctx.workspaceId, params.id, period, false);
  }),

  r("POST", "/prd/assets/:id/depreciate", { perm: "assets:write" }, async ({ ctx, tx, params, json, idemKey }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Aset tidak ditemukan.");
    const b = await json(z.object({ periodMonth: periodSchema }));
    return idempotent(tx as Tx, ctx, idemKey, async () => {
      const calc = await computeDepreciation(tx, ctx.workspaceId, params.id, b.periodMonth, true);
      const expId = await ensureSystemAccount(tx as Tx, ctx, { subtype: "dep_expense", code: "6108", name: "Beban Penyusutan", type: "expense" });
      const accId = await ensureSystemAccount(tx as Tx, ctx, { subtype: "accum_dep", code: "1501", name: "Akumulasi Penyusutan", type: "asset" });
      const amount = fromCents(BigInt(calc.amountCents));
      const date = lastDayOfMonth(b.periodMonth);
      // assertPeriodOpen di dalam postJournal menolak periode yang terkunci
      const je = await postJournal(tx as Tx, ctx, {
        date, memo: `Penyusutan ${calc.assetName} ${b.periodMonth}`, source: "asset_depreciation", sourceId: params.id,
        lines: [{ accountId: expId, debit: amount }, { accountId: accId, credit: amount }],
      });
      await tx.execute(sql`
        INSERT INTO asset_depreciation_logs (workspace_id, asset_id, period_month, amount_cents, book_value_after_cents, journal_entry_id)
        VALUES (${ctx.workspaceId}, ${params.id}, ${b.periodMonth}, ${calc.amountCents}, ${calc.bookValueAfterCents}, ${je})
      `);
      await tx.execute(sql`
        UPDATE fixed_assets SET accumulated_dep_cents = ${calc.accumulatedAfterCents}, book_value_cents = ${calc.bookValueAfterCents}
        WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId}
      `);
      await audit(tx, ctx, "asset.depreciate", "fixed_asset", params.id, { periodMonth: b.periodMonth, amount: calc.amountCents, journalId: je });
      return { periodMonth: b.periodMonth, amountCents: calc.amountCents, bookValueCents: calc.bookValueAfterCents, journalEntryId: je };
    });
  }),

  r("POST", "/prd/assets/:id/depreciation/reverse", { perm: "assets:write" }, async ({ ctx, tx, params, json }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Aset tidak ditemukan.");
    const b = await json(z.object({ periodMonth: periodSchema }));
    await tx.execute(sql`SELECT id FROM fixed_assets WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId} FOR UPDATE`);
    const res = await tx.execute(sql`
      SELECT id, amount_cents::text AS amt, journal_entry_id AS je FROM asset_depreciation_logs
      WHERE asset_id = ${params.id} AND period_month = ${b.periodMonth} AND workspace_id = ${ctx.workspaceId} AND status = 'posted' FOR UPDATE`);
    const log = res.rows[0] as { id: string; amt: string; je: string | null } | undefined;
    if (!log) throw new HttpError(404, "Penyusutan periode itu tidak ditemukan atau sudah dibalik.", "not_found");
    if (!log.je) throw new HttpError(409, "Penyusutan lama tanpa jurnal tidak dapat dibalik otomatis.", "no_journal");
    const rev = await reverseJournal(tx as Tx, ctx, log.je, lastDayOfMonth(b.periodMonth), `Pembalikan penyusutan ${b.periodMonth}`);
    await tx.execute(sql`UPDATE asset_depreciation_logs SET status = 'reversed', reversal_entry_id = ${rev}, reversed_at = now() WHERE id = ${log.id}`);
    await tx.execute(sql`
      UPDATE fixed_assets SET accumulated_dep_cents = accumulated_dep_cents - ${log.amt}::bigint, book_value_cents = book_value_cents + ${log.amt}::bigint
      WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId}`);
    await audit(tx, ctx, "asset.depreciation_reverse", "fixed_asset", params.id, { periodMonth: b.periodMonth, reversalId: rev });
    return { ok: true, reversalEntryId: rev };
  }),

  /* ───────── 5. Commissions, Cost of Service & Operational Displays ───────── */
  r("GET", "/prd/commissions", { perm: "hr:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, name, basis, rate_percent::text AS "ratePercent", is_active AS "isActive", created_at AS "createdAt"
      FROM commission_rules WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC
    `);
    return { items: res.rows };
  }),

  r("POST", "/prd/commissions", { perm: "hr:write" }, async ({ ctx, tx, json }) => {
    const b = await json(z.object({ name: z.string().min(1).max(100), basis: z.enum(["product", "service", "target"]), ratePercent: z.coerce.number().min(0).max(100) }));
    const ins = await tx.execute(sql`
      INSERT INTO commission_rules (workspace_id, name, basis, rate_percent)
      VALUES (${ctx.workspaceId}, ${b.name}, ${b.basis}, ${String(b.ratePercent)}::numeric)
      RETURNING id
    `);
    return ins.rows[0];
  }),

  r("GET", "/prd/service-costs", { perm: "ops:read" }, async ({ ctx, tx }) => {
    const res = await tx.execute(sql`
      SELECT id, service_name AS "serviceName", standard_cost_cents::text AS "standardCostCents",
             labor_cost_cents::text AS "laborCostCents", material_cost_cents::text AS "materialCostCents",
             equipment_cost_cents::text AS "equipmentCostCents", facility_cost_cents::text AS "facilityCostCents",
             revenue_cents::text AS "revenueCents", wait_minutes AS "waitMinutes", process_minutes AS "processMinutes",
             created_at AS "createdAt"
      FROM service_costs WHERE workspace_id = ${ctx.workspaceId} ORDER BY created_at DESC LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/prd/service-costs", { perm: "ops:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        serviceName: z.string().min(1).max(120),
        standardCost: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        laborCost: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        materialCost: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        equipmentCost: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        facilityCost: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        revenue: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        waitMinutes: z.coerce.number().int().min(0).default(0),
        processMinutes: z.coerce.number().int().min(0).default(0),
      }),
    );
    const ins = await tx.execute(sql`
      INSERT INTO service_costs (workspace_id, service_name, standard_cost_cents, labor_cost_cents, material_cost_cents, equipment_cost_cents, facility_cost_cents, revenue_cents, wait_minutes, process_minutes)
      VALUES (${ctx.workspaceId}, ${b.serviceName}, ${toCents(b.standardCost).toString()}, ${toCents(b.laborCost).toString()},
              ${toCents(b.materialCost).toString()}, ${toCents(b.equipmentCost).toString()}, ${toCents(b.facilityCost).toString()},
              ${toCents(b.revenue).toString()}, ${b.waitMinutes}, ${b.processMinutes})
      RETURNING id
    `);
    return ins.rows[0];
  }),

  r("GET", "/prd/displays", { perm: "ops:read" }, async ({ ctx, tx, query }) => {
    const station = query.get("station");
    const res = await tx.execute(sql`
      SELECT id, ticket_no AS "ticketNo", station, title, items, priority, status, created_at AS "createdAt"
      FROM operational_displays
      WHERE workspace_id = ${ctx.workspaceId} ${station ? sql`AND station = ${station}` : sql``}
      ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, created_at ASC
      LIMIT 100
    `);
    return { items: res.rows };
  }),

  r("POST", "/prd/displays", { perm: "ops:write" }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        station: z.enum(["kitchen", "production", "warehouse", "pickup"]),
        title: z.string().min(1).max(120),
        priority: z.enum(["normal", "high", "urgent"]).default("normal"),
        items: z.array(z.string().min(1)).default([]),
      }),
    );
    const ticketNo = await nextNumber(tx, ctx.workspaceId, "display_ticket", "TKT");
    const ins = await tx.execute(sql`
      INSERT INTO operational_displays (workspace_id, ticket_no, station, title, priority, items)
      VALUES (${ctx.workspaceId}, ${ticketNo}, ${b.station}, ${b.title}, ${b.priority}, ${JSON.stringify(b.items)}::jsonb)
      RETURNING id, ticket_no AS "ticketNo", status
    `);
    return ins.rows[0];
  }),

  r("PATCH", "/prd/displays/:id", { perm: "ops:write" }, async ({ ctx, tx, params, json }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Tiket tidak ditemukan.");
    const b = await json(z.object({ status: z.enum(["queued", "in_progress", "ready", "completed"]) }));
    const up = await tx.execute(sql`
      UPDATE operational_displays SET status = ${b.status}, updated_at = now()
      WHERE id = ${params.id} AND workspace_id = ${ctx.workspaceId}
      RETURNING id, status
    `);
    if (!up.rows.length) throw new HttpError(404, "Tiket tidak ditemukan.");
    return up.rows[0];
  }),
];
