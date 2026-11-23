import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { HttpError, type DB } from "./core";

export const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB (muat batas payload 4.5 MB Vercel Function)

export type StoredFileMeta = {
  id: string;
  entityType: string;
  entityId: string | null;
  filename: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

export interface StorageAdapter {
  put(
    tx: DB,
    input: {
      workspaceId: string;
      entityType: string;
      entityId: string | null;
      filename: string;
      declaredMime: string;
      bytes: Buffer;
      deviceId: string;
    },
  ): Promise<StoredFileMeta>;
  list(tx: DB, workspaceId: string, entityType: string, entityId?: string | null): Promise<StoredFileMeta[]>;
  get(tx: DB, workspaceId: string, id: string): Promise<{ meta: StoredFileMeta; bytes: Buffer } | null>;
  remove(tx: DB, workspaceId: string, id: string): Promise<boolean>;
}

export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? "lampiran";
  const cleaned = base.replace(/[^\w.\- ()]/g, "_").replace(/^\.+/, "").slice(0, 120);
  return cleaned || "lampiran.bin";
}

export function detectMimeByMagicBytes(bytes: Buffer, declaredMime: string): string {
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (declaredMime === "text/csv" || declaredMime === "text/plain") {
    // Tolak konten HTML/script
    const head = bytes.subarray(0, 512).toString("utf8").toLowerCase();
    if (head.includes("<html") || head.includes("<script") || head.includes("<!doctype")) {
      throw new HttpError(422, "Tipe berkas tidak diizinkan.");
    }
    return declaredMime;
  }
  throw new HttpError(422, "Format berkas tidak didukung. Gunakan PDF, PNG, JPG, WEBP, CSV, atau TXT.");
}

export const pgByteaStorage: StorageAdapter = {
  async put(tx, input) {
    if (input.bytes.length === 0) throw new HttpError(422, "Berkas kosong.");
    if (input.bytes.length > MAX_FILE_BYTES) {
      throw new HttpError(413, "Ukuran berkas melebihi batas maksimum 3 MB.");
    }
    const safeName = sanitizeFilename(input.filename);
    const mime = detectMimeByMagicBytes(input.bytes, input.declaredMime);
    const sha = createHash("sha256").update(input.bytes).digest("hex");

    const res = await tx.execute(sql`
      INSERT INTO files (workspace_id, entity_type, entity_id, filename, mime, size_bytes, sha256, data, uploaded_by_device_id)
      VALUES (${input.workspaceId}, ${input.entityType}, ${input.entityId}, ${safeName}, ${mime}, ${input.bytes.length}, ${sha}, ${input.bytes}, ${input.deviceId})
      RETURNING id, entity_type AS "entityType", entity_id AS "entityId", filename, mime, size_bytes AS "sizeBytes", sha256, created_at AS "createdAt"
    `);
    return res.rows[0] as StoredFileMeta;
  },

  async list(tx, workspaceId, entityType, entityId) {
    const res = await tx.execute(sql`
      SELECT id, entity_type AS "entityType", entity_id AS "entityId", filename, mime, size_bytes AS "sizeBytes", sha256, created_at AS "createdAt"
      FROM files
      WHERE workspace_id = ${workspaceId}
        AND entity_type = ${entityType}
        ${entityId ? sql`AND entity_id = ${entityId}` : sql``}
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return res.rows as StoredFileMeta[];
  },

  async get(tx, workspaceId, id) {
    const res = await tx.execute(sql`
      SELECT id, entity_type AS "entityType", entity_id AS "entityId", filename, mime, size_bytes AS "sizeBytes", sha256, created_at AS "createdAt", data
      FROM files
      WHERE workspace_id = ${workspaceId} AND id = ${id}
      LIMIT 1
    `);
    const row = res.rows[0] as (StoredFileMeta & { data: Buffer }) | undefined;
    if (!row) return null;
    const { data, ...meta } = row;
    return { meta, bytes: Buffer.isBuffer(data) ? data : Buffer.from(data) };
  },

  async remove(tx, workspaceId, id) {
    const res = await tx.execute(sql`
      DELETE FROM files WHERE workspace_id = ${workspaceId} AND id = ${id} RETURNING id
    `);
    return res.rows.length > 0;
  },
};
