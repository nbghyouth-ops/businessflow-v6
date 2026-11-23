import { z } from "zod";
import { audit, HttpError, r, type Route } from "../core";
import { MAX_FILE_BYTES, pgByteaStorage } from "../storage";

const uuid = z.string().uuid();

export const fileRoutes: Route[] = [
  r("GET", "/files", { auth: "tab" }, async ({ ctx, tx, query }) => {
    const entityType = query.get("entityType") ?? "client";
    const entityId = query.get("entityId");
    if (entityId && !uuid.safeParse(entityId).success) throw new HttpError(422, "entityId tidak valid.");
    const items = await pgByteaStorage.list(tx, ctx.workspaceId, entityType, entityId);
    return { items };
  }),

  r("POST", "/files", { auth: "tab", maxBodyBytes: 4 * 1024 * 1024 }, async ({ ctx, tx, json }) => {
    const b = await json(
      z.object({
        entityType: z.enum(["client", "payment", "task", "business_logo", "asset"]),
        entityId: uuid.nullable().optional(),
        filename: z.string().min(1).max(200),
        mime: z.string().min(1).max(120),
        base64: z.string().min(1),
      }),
    );
    const bytes = Buffer.from(b.base64, "base64");
    if (bytes.length > MAX_FILE_BYTES) {
      throw new HttpError(413, "Ukuran berkas melebihi batas maksimum 3 MB.");
    }
    const meta = await pgByteaStorage.put(tx, {
      workspaceId: ctx.workspaceId,
      entityType: b.entityType,
      entityId: b.entityId ?? null,
      filename: b.filename,
      declaredMime: b.mime,
      bytes,
      deviceId: ctx.deviceId,
    });
    await audit(tx, ctx, "file.upload", b.entityType, meta.id, { filename: meta.filename, size: meta.sizeBytes });
    return meta;
  }),

  r("GET", "/files/:id/download", { auth: "tab" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Berkas tidak ditemukan.");
    const found = await pgByteaStorage.get(tx, ctx.workspaceId, params.id);
    if (!found) throw new HttpError(404, "Berkas tidak ditemukan.");
    return new Response(new Uint8Array(found.bytes), {
      status: 200,
      headers: {
        "Content-Type": found.meta.mime,
        "Content-Disposition": `attachment; filename="${found.meta.filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }),

  r("DELETE", "/files/:id", { auth: "tab" }, async ({ ctx, tx, params }) => {
    if (!uuid.safeParse(params.id).success) throw new HttpError(404, "Berkas tidak ditemukan.");
    const ok = await pgByteaStorage.remove(tx, ctx.workspaceId, params.id);
    if (!ok) throw new HttpError(404, "Berkas tidak ditemukan.");
    await audit(tx, ctx, "file.delete", "file", params.id);
    return { ok: true };
  }),
];
