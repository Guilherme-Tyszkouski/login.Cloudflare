// GET /oauth/callback/google  e  GET /oauth/callback/github
//
// Ordem obrigatória (roteiro 13.4):
// 1. recusar error ou a ausência de code e state;
// 2. exigir o cookie __Host-oauth-tx;
// 3. calcular seu resumo e localizar uma transação não expirada;
// 4. comparar o resumo de state com o valor conservado no D1;
// 5. apagar a transação antes de concluir o fluxo;
// 6. trocar o código com o code_verifier e o Client Secret;
// 7. validar a resposta de identidade conforme o provedor;
// 8. criar uma sessão opaca;
// 9. limpar o cookie temporário;
// 10. redirecionar para PUBLIC_BASE_URL.
//
// Nada do corpo da troca de tokens é registrado.

import {
  randomToken,
  sha256Base64Url,
  timingSafeEqual,
  nowInSeconds,
} from "../../_shared/crypto.js";
import {
  TX_COOKIE,
  SESSION_MAX_AGE,
  clearTxCookie,
  readCookie,
  sessionCookie,
} from "../../_shared/cookies.js";
import { googleDiscovery, verifyGoogleIdToken } from "../../_shared/oidc.js";
import {
  SUPPORTED_PROVIDERS,
  GITHUB_API_USER_URL,
  GITHUB_API_VERSION,
  GITHUB_ISSUER,
  GITHUB_TOKEN_URL,
  GOOGLE_ISSUER,
  USER_AGENT,
  baseUrl,
  clientId,
  clientSecret,
  failure,
  noStoreHeaders,
  notFound,
  readProvider,
  redirectUri,
} from "../../_shared/providers.js";

/** Erro com o cookie de transação já expirado na resposta. */
function abort(status, code) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: noStoreHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": clearTxCookie(),
    }),
  });
}

/** Troca o código por tokens no Google. */
async function exchangeGoogle(env, code, codeVerifier) {
  const discovery = await googleDiscovery();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    client_id: clientId(env, "google"),
    client_secret: clientSecret(env, "google"),
    redirect_uri: redirectUri(env, "google"),
  });

  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!response.ok) throw new Error("troca_recusada");
  return response.json();
}

/** Troca o código por tokens no GitHub. */
async function exchangeGitHub(env, code, codeVerifier) {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      client_id: clientId(env, "github"),
      client_secret: clientSecret(env, "github"),
      redirect_uri: redirectUri(env, "github"),
    }),
  });
  if (!response.ok) throw new Error("troca_recusada");

  const payload = await response.json();
  // O GitHub responde 200 mesmo quando recusa a troca.
  if (payload.error) throw new Error("troca_recusada");
  if (!payload.access_token) throw new Error("access_token_ausente");
  if (String(payload.token_type || "").toLowerCase() !== "bearer") {
    throw new Error("token_type_invalido");
  }
  return payload;
}

/** Consulta o perfil autenticado do GitHub. */
async function fetchGitHubUser(accessToken) {
  const response = await fetch(GITHUB_API_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": USER_AGENT,
    },
  });
  if (response.status !== 200) throw new Error("perfil_indisponivel");

  const profile = await response.json();
  if (!Number.isInteger(profile.id)) throw new Error("identificador_invalido");
  return profile;
}

/**
 * Revoga a autorização concedida à OAuth App.
 * Elimina o access_token e qualquer refresh_token associado.
 */
async function revokeGitHubGrant(env, accessToken) {
  const id = clientId(env, "github");
  const secret = clientSecret(env, "github");
  const basic = btoa(`${id}:${secret}`);

  const response = await fetch(`https://api.github.com/applications/${id}/grant`, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (response.status !== 204) throw new Error("revogacao_recusada");
}

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const provider = readProvider(params);
  if (!SUPPORTED_PROVIDERS.has(provider)) return notFound();

  let base;
  try {
    base = baseUrl(env);
  } catch {
    return failure(500, "configuracao_indisponivel");
  }

  const url = new URL(request.url);

  // 1. o provedor recusou, ou faltam parâmetros
  if (url.searchParams.get("error")) return abort(400, "autorizacao_recusada");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return abort(400, "parametros_ausentes");

  // 2. cookie temporário obrigatório
  const transactionId = readCookie(request, TX_COOKIE);
  if (!transactionId) return abort(400, "transacao_ausente");

  // 3. localizar a transação não expirada pelo resumo do cookie
  const transactionHash = await sha256Base64Url(transactionId);
  const now = nowInSeconds();

  let transaction;
  try {
    transaction = await env.DB.prepare(
      `SELECT id_hash, provider, state_hash, nonce, code_verifier, expires_at
         FROM oauth_transactions
        WHERE id_hash = ? AND provider = ? AND expires_at > ?`,
    )
      .bind(transactionHash, provider, now)
      .first();
  } catch {
    return abort(500, "armazenamento_indisponivel");
  }
  if (!transaction) return abort(400, "transacao_invalida");

  // 4. o state precisa ser o mesmo que iniciou a transação
  const stateHash = await sha256Base64Url(state);
  const stateMatches = timingSafeEqual(stateHash, transaction.state_hash);

  // 5. a transação é de uso único: some antes de qualquer chamada externa
  await env.DB.prepare("DELETE FROM oauth_transactions WHERE id_hash = ?")
    .bind(transactionHash)
    .run();

  if (!stateMatches) return abort(400, "state_invalido");

  // 6 e 7. troca do código e confirmação da identidade
  let identity;
  try {
    if (provider === "google") {
      const tokens = await exchangeGoogle(env, code, transaction.code_verifier);
      const claims = await verifyGoogleIdToken(
        tokens.id_token,
        clientId(env, "google"),
        transaction.nonce,
      );
      identity = {
        issuer: GOOGLE_ISSUER,
        subject: String(claims.sub),
        email: claims.email ?? null,
        displayName: claims.name ?? claims.email ?? null,
      };
    } else {
      const tokens = await exchangeGitHub(env, code, transaction.code_verifier);
      const profile = await fetchGitHubUser(tokens.access_token);
      // A autorização é revogada antes de a sessão local existir.
      await revokeGitHubGrant(env, tokens.access_token);
      identity = {
        issuer: GITHUB_ISSUER,
        subject: String(profile.id),
        email: profile.email ?? null,
        displayName: profile.name ?? profile.login ?? null,
      };
    }
  } catch {
    // Nenhum detalhe do provedor é exposto ao navegador.
    return abort(400, "identidade_nao_confirmada");
  }

  // 8. sessão opaca: o navegador recebe o valor bruto, o D1 guarda o resumo
  const sessionId = randomToken();
  const sessionHash = await sha256Base64Url(sessionId);
  const createdAt = nowInSeconds();
  const sessionExpiresAt = createdAt + SESSION_MAX_AGE;

  try {
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(createdAt).run();
    await env.DB.prepare(
      `INSERT INTO sessions
         (id_hash, issuer, subject, email, display_name, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        sessionHash,
        identity.issuer,
        identity.subject,
        identity.email,
        identity.displayName,
        sessionExpiresAt,
        createdAt,
      )
      .run();
  } catch {
    return abort(500, "sessao_nao_criada");
  }

  // 9 e 10. limpar o cookie temporário e voltar para a página
  const headers = new Headers(noStoreHeaders({ Location: base }));
  headers.append("Set-Cookie", clearTxCookie());
  headers.append("Set-Cookie", sessionCookie(sessionId));
  return new Response(null, { status: 302, headers });
}
