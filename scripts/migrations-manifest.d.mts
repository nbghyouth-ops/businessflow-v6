export interface CanonicalMigration {
  id: string;
  legacyId: string;
  path: string;
}

declare const CANONICAL_MIGRATIONS: CanonicalMigration[];
export { CANONICAL_MIGRATIONS };
