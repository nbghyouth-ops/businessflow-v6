-- 016_marketplace_credentials: kredensial API kanal marketplace.
-- Disimpan terenkripsi (AES-256-GCM) di server; hanya hint 4 karakter terakhir yang
-- boleh dibaca kembali lewat API. Tidak ada kredensial yang dikembalikan sebagai plaintext.
-- Additif + idempoten.

ALTER TABLE marketplace_channels ADD COLUMN IF NOT EXISTS credential_enc TEXT;
ALTER TABLE marketplace_channels ADD COLUMN IF NOT EXISTS credential_hint TEXT;
ALTER TABLE marketplace_channels ADD COLUMN IF NOT EXISTS credential_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN marketplace_channels.credential_enc IS 'Ciphertext AES-256-GCM (iv.tag.data, base64) — jangan pernah diekspos ke klien';
COMMENT ON COLUMN marketplace_channels.credential_hint IS 'Empat karakter terakhir untuk ditampilkan di UI';
