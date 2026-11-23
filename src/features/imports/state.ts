/**
 * Satu sumber kebenaran status & transisinya (prompt R10 §A2/AL-1).
 * Transisi ilegal ditolak oleh `canTransition`; diuji di `tests/unit/imports-state.test.ts`.
 */

export const BATCH_STATUSES = [
  "UPLOADED",
  "FILE_VALIDATION_FAILED",
  "NEEDS_MAPPING",
  "STRUCTURE_INVALID",
  "VALIDATING",
  "PREVIEW_READY",
  "DRY_RUN_READY",
  "AWAITING_CONFIRMATION",
  "COMMITTING",
  "COMMITTED",
  "FAILED",
  "CANCELLED",
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const PROFILE_STATUSES = ["DRAFT", "USER_CONFIRMED", "NEEDS_UPDATE", "DISABLED"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const ROW_STATUSES = [
  "VALID",
  "WARNING",
  "NEEDS_MAPPING",
  "POTENTIAL_DUPLICATE",
  "DUPLICATE",
  "INVALID",
  "CONFLICT",
  "REJECTED",
  "COMMITTED",
] as const;
export type RowStatus = (typeof ROW_STATUSES)[number];

const BATCH_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  UPLOADED: ["VALIDATING", "FILE_VALIDATION_FAILED", "STRUCTURE_INVALID", "CANCELLED"],
  FILE_VALIDATION_FAILED: ["UPLOADED", "CANCELLED"],
  STRUCTURE_INVALID: ["UPLOADED", "CANCELLED"],
  NEEDS_MAPPING: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["PREVIEW_READY", "NEEDS_MAPPING", "FILE_VALIDATION_FAILED", "FAILED"],
  PREVIEW_READY: ["DRY_RUN_READY", "VALIDATING", "CANCELLED", "FAILED"],
  DRY_RUN_READY: ["AWAITING_CONFIRMATION", "VALIDATING", "CANCELLED", "FAILED"],
  AWAITING_CONFIRMATION: ["COMMITTING", "DRY_RUN_READY", "CANCELLED"],
  COMMITTING: ["COMMITTED", "FAILED"],
  COMMITTED: [],
  FAILED: ["UPLOADED", "CANCELLED"],
  CANCELLED: [],
};

export function canTransition(from: BatchStatus, to: BatchStatus): boolean {
  return BATCH_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: BatchStatus, to: BatchStatus): void {
  if (!canTransition(from, to)) {
    throw Object.assign(new Error(`Transisi batch tidak sah: ${from} → ${to}`), { code: "illegal_transition" });
  }
}

/** Status baris yang mengizinkan baris ditulis saat commit. */
export const WRITABLE_ROW_STATUSES: RowStatus[] = ["VALID", "WARNING"];
