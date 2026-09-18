// POST /oauth/logout
//
// 1. aceitar somente POST;
// 2. exigir Origin exatamente igual a PUBLIC_BASE_URL;
// 3. remover a linha da sessão no D1;
// 4. expirar o cookie;
// 5. responder com Cache-Control: no-store.
//
// Isto revoga a sessão local. A sessão da pessoa no Google ou no GitHub
// continua aberta — o laboratório não tem poder sobre elas.

import { sha256Base64Url } from "../_shared/crypto.js";
import { SESSION_COOKIE, clearSessionCookie, readCookie } from "../_shared/cookies.js";
import { baseUrl, failure, noStoreHeaders } from "../_shared/providers.js";

export async function onRequestPost(context) {
  const { env, request } = context;

  let base;
  try {
    base = baseUrl(env);
  } catch {
    return failure(500, "configuracao_indisponivel");
  }

  // 2. conferência de origem, independente do que o navegador já impõe
  const origin = request.headers.get("Origin");
  if (origin !== base) return failure(403, "origem_invalida");

  // 3. apagar a sessão, se houver
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (sessionId) {
    const sessionHash = await sha256Base64Url(sessionId);
    try {
      await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(sessionHash).run();
    } catch {
      return failure(500, "armazenamento_indisponivel");
    }
  }

  // 4 e 5. expirar o cookie e devolver o visitante à página
  const headers = new Headers(
    noStoreHeaders({ Location: base, "Set-Cookie": clearSessionCookie() }),
  );
  return new Response(null, { status: 303, headers });
}

// 1. qualquer outro método é recusado.
export function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response(JSON.stringify({ error: "metodo_nao_permitido" }), {
    status: 405,
    headers: noStoreHeaders({
      "Content-Type": "application/json; charset=utf-8",
      Allow: "POST",
    }),
  });
}
