export interface CanonicalMigration {
  id: string;
  legacyId: string;
  path: string;
}

export const CANONICAL_MIGRATIONS: CanonicalMigration[];
