// Configuração dos dois provedores e helpers de resposta.

export const SUPPORTED_PROVIDERS = new Set(["google", "github"]);

export const GOOGLE_ISSUER = "https://accounts.google.com";
export const GOOGLE_DISCOVERY_URL =
  "https://accounts.google.com/.well-known/openid-configuration";
export const GOOGLE_SCOPE = "openid email profile";

export const GITHUB_ISSUER = "https://github.com";
export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_API_USER_URL = "https://api.github.com/user";
export const GITHUB_API_VERSION = "2026-03-10";
export const USER_AGENT = "oauth-pages-lab";

/** Normaliza o parâmetro dinâmico [provider] da rota. */
export function readProvider(params) {
  const value = Array.isArray(params?.provider) ? params.provider[0] : params?.provider;
  return typeof value === "string" ? value.toLowerCase() : "";
}

/** URL_BASE sem barra final, vinda da variável PUBLIC_BASE_URL. */
export function baseUrl(env) {
  const value = env?.PUBLIC_BASE_URL;
  if (!value) throw new Error("configuracao_ausente");
  return String(value).replace(/\/+$/, "");
}

/** A URL de retorno exata cadastrada em cada provedor. */
export function redirectUri(env, provider) {
  return `${baseUrl(env)}/oauth/callback/${provider}`;
}

export function clientId(env, provider) {
  const value = provider === "google" ? env.GOOGLE_CLIENT_ID : env.GITHUB_CLIENT_ID;
  if (!value) throw new Error("configuracao_ausente");
  return String(value);
}

/** Só é lido dentro da Function, nunca enviado ao navegador. */
export function clientSecret(env, provider) {
  const value = provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.GITHUB_CLIENT_SECRET;
  if (!value) throw new Error("configuracao_ausente");
  return String(value);
}

/** Cabeçalhos que nunca podem ser guardados em cache. */
export function noStoreHeaders(extra = {}) {
  return { "Cache-Control": "no-store", ...extra };
}

/**
 * Resposta de erro curta. O código é genérico de propósito:
 * nenhuma mensagem revela cookie, state, token ou segredo.
 */
export function failure(status, code) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: noStoreHeaders({ "Content-Type": "application/json; charset=utf-8" }),
  });
}

/** Provedor desconhecido: 404 sem detalhes internos. */
export function notFound() {
  return new Response("Not found", { status: 404, headers: noStoreHeaders() });
}
