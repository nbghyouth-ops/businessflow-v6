-- 014_user_locale: preferensi bahasa per pengguna (lintas perangkat), bukan localStorage.
-- Additif + idempoten. Bahasa workspace tetap menjadi cadangan.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS locale text;
