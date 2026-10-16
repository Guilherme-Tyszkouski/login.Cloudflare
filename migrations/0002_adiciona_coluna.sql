-- Migration 0002: adiciona last_seen_at em sessions.
-- A coluna existe para exercitar a migração automática da Tarefa 4 (migrar.yml).
-- O enunciado usa uma tabela `notas`, que não existe neste projeto; foi
-- substituída por `sessions`, que é a tabela real.

ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;
