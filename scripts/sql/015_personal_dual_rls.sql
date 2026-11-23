-- 015_personal_dual_rls: RLS dua lapis untuk ruang pribadi.
-- Lapis 1: baris milik pemilik (app.owner_id).
-- Lapis 2: pemilik tersebut benar-benar berperan owner aktif pada workspace konteks (app.workspace_id).
-- Tanpa kedua setting (konteks kosong) → tidak ada baris yang lolos (gagal tertutup).
-- Additif + idempoten: mengganti policy lama dengan nama baru.

DROP POLICY IF EXISTS owner_isolation ON personal_accounts;
DROP POLICY IF EXISTS personal_dual_scope ON personal_accounts;
CREATE POLICY personal_dual_scope ON personal_accounts FOR ALL
  USING (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS owner_isolation ON personal_transactions;
DROP POLICY IF EXISTS personal_dual_scope ON personal_transactions;
CREATE POLICY personal_dual_scope ON personal_transactions FOR ALL
  USING (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS owner_isolation ON personal_budgets;
DROP POLICY IF EXISTS personal_dual_scope ON personal_budgets;
CREATE POLICY personal_dual_scope ON personal_budgets FOR ALL
  USING (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS owner_isolation ON personal_goals;
DROP POLICY IF EXISTS personal_dual_scope ON personal_goals;
CREATE POLICY personal_dual_scope ON personal_goals FOR ALL
  USING (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND m.user_id = NULLIF(current_setting('app.owner_id', true), '')
        AND m.role = 'owner'
        AND m.status = 'active'
    )
  );
