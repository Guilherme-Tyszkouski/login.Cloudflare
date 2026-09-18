// Leitura e montagem dos cookies do laboratório.
//
// O prefixo __Host- só é aceito pelo navegador quando o cookie tem
// Secure, Path=/ e NÃO tem Domain. Isso o prende a esta origem exata.

export const TX_COOKIE = "__Host-oauth-tx";
export const SESSION_COOKIE = "__Host-session";

export const TX_MAX_AGE = 600; // 10 minutos
export const SESSION_MAX_AGE = 28800; // 8 horas

/** Devolve o valor de um cookie da requisição, ou null. */
export function readCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function txCookie(value) {
  return `${TX_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TX_MAX_AGE}`;
}

export function clearTxCookie() {
  return `${TX_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function sessionCookie(value) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
