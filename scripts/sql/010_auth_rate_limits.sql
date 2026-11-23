-- 010_auth_rate_limits.sql — rate limit login/callback lintas instance (non-tenant, bukan untuk bf_app)
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  last_request BIGINT NOT NULL
);
REVOKE ALL ON TABLE auth_rate_limits FROM bf_app;
