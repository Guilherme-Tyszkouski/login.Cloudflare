// Utilitários de Web Crypto usados pelo laboratório.
// Nenhuma biblioteca externa: só APIs que o runtime da Cloudflare já oferece.

const encoder = new TextEncoder();

/** Converte bytes em Base64URL sem preenchimento (sem "="). */
export function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Converte uma string Base64URL de volta para bytes. */
export function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * 32 bytes aleatórios em Base64URL (43 caracteres).
 * Usado para: identificador bruto da transação, state, nonce,
 * code_verifier e identificador bruto da sessão.
 */
export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** SHA-256 de um texto, devolvido em Base64URL sem preenchimento. */
export async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value)));
  return toBase64Url(new Uint8Array(digest));
}

/** Comparação de tempo constante entre dois resumos. */
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Epoch em segundos. */
export function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}
