// GET /api/me
//
// Resolve a sessão local pelo resumo do cookie e devolve o perfil mínimo.
// Sem cookie, com sessão desconhecida ou expirada: 401.

import { sha256Base64Url, nowInSeconds } from "../_shared/crypto.js";
import { SESSION_COOKIE, readCookie } from "../_shared/cookies.js";
import { failure, noStoreHeaders } from "../_shared/providers.js";

export async function onRequestGet(context) {
  const { env, request } = context;

  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId) return failure(401, "sessao_ausente");

  const sessionHash = await sha256Base64Url(sessionId);
  const now = nowInSeconds();

  let session;
  try {
    session = await env.DB.prepare(
      `SELECT issuer, subject, email, display_name, expires_at
         FROM sessions
        WHERE id_hash = ? AND expires_at > ?`,
    )
      .bind(sessionHash, now)
      .first();
  } catch {
    return failure(500, "armazenamento_indisponivel");
  }

  if (!session) return failure(401, "sessao_invalida");

  // Perfil mínimo: nada de tokens, resumos ou identificadores internos.
  return new Response(
    JSON.stringify({
      issuer: session.issuer,
      subject: session.subject,
      email: session.email,
      displayName: session.display_name,
      expiresAt: session.expires_at,
    }),
    { headers: noStoreHeaders({ "Content-Type": "application/json; charset=utf-8" }) },
  );
}
