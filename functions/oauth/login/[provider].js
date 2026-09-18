// GET /oauth/login/google  e  GET /oauth/login/github
//
// Cria a transação, guarda apenas resumos no D1, entrega o cookie temporário
// e redireciona (302) ao provedor. O Client Secret e o code_verifier nunca
// aparecem nesta URL.

import { randomToken, sha256Base64Url, nowInSeconds } from "../../_shared/crypto.js";
import { txCookie, TX_MAX_AGE } from "../../_shared/cookies.js";
import { googleDiscovery } from "../../_shared/oidc.js";
import {
  SUPPORTED_PROVIDERS,
  GITHUB_AUTHORIZE_URL,
  GOOGLE_SCOPE,
  baseUrl,
  clientId,
  failure,
  noStoreHeaders,
  notFound,
  readProvider,
  redirectUri,
} from "../../_shared/providers.js";

export async function onRequestGet(context) {
  const { env, params } = context;
  const provider = readProvider(params);

  // 1. aceitar somente google ou github
  if (!SUPPORTED_PROVIDERS.has(provider)) return notFound();

  let authorizeEndpoint;
  let redirect;
  let id;
  try {
    baseUrl(env); // valida PUBLIC_BASE_URL cedo
    id = clientId(env, provider);
    redirect = redirectUri(env, provider);
    authorizeEndpoint =
      provider === "google"
        ? (await googleDiscovery()).authorization_endpoint
        : GITHUB_AUTHORIZE_URL;
  } catch {
    return failure(500, "configuracao_indisponivel");
  }

  // 2. gerar a transação (32 bytes aleatórios para cada valor)
  const transactionId = randomToken();
  const state = randomToken();
  const codeVerifier = randomToken();
  const nonce = provider === "google" ? randomToken() : null;

  // PKCE S256: o desafio é o resumo do verificador.
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const transactionHash = await sha256Base64Url(transactionId);
  const stateHash = await sha256Base64Url(state);
  const now = nowInSeconds();
  const expiresAt = now + TX_MAX_AGE;

  try {
    // Limpeza oportunista das transações vencidas.
    await env.DB.prepare("DELETE FROM oauth_transactions WHERE expires_at < ?")
      .bind(now)
      .run();

    await env.DB.prepare(
      `INSERT INTO oauth_transactions
         (id_hash, provider, state_hash, nonce, code_verifier, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(transactionHash, provider, stateHash, nonce, codeVerifier, expiresAt)
      .run();
  } catch {
    return failure(500, "armazenamento_indisponivel");
  }

  // 4. montar o pedido de autorização
  const authorize = new URL(authorizeEndpoint);
  authorize.searchParams.set("client_id", id);
  authorize.searchParams.set("redirect_uri", redirect);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", codeChallenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  if (provider === "google") {
    authorize.searchParams.set("scope", GOOGLE_SCOPE);
    authorize.searchParams.set("nonce", nonce);
    authorize.searchParams.set("prompt", "select_account");
  }
  // No GitHub: scope e nonce são omitidos de propósito.

  // 3 e 5. cookie temporário + redirecionamento
  const headers = new Headers(
    noStoreHeaders({ Location: authorize.toString(), "Set-Cookie": txCookie(transactionId) }),
  );
  return new Response(null, { status: 302, headers });
}
