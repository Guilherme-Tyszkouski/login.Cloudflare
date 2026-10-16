-- Migration 0001: esquema inicial do D1 (binding DB).
-- Mesmo conteúdo de esquema-d1.sql. As tabelas já foram criadas à mão no
-- console do D1, então tudo usa IF NOT EXISTS para a migração não falhar
-- com "table already exists" no banco remoto.

CREATE TABLE IF NOT EXISTS oauth_transactions (
  id_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'github')),
  state_hash TEXT NOT NULL,
  nonce TEXT,
  code_verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_transactions_expiry
  ON oauth_transactions (expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expiry
  ON sessions (expires_at);
