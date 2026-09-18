// Validação do id_token do Google usando apenas Web Crypto.
//
// Roteiro, item 13.5: separar o JWT, exigir RS256, buscar o documento de
// descoberta e o JWKS, escolher a chave pelo kid, importar a JWK, verificar
// a assinatura e só então validar iss, aud, exp, iat e nonce.

import { base64UrlToBytes, nowInSeconds } from "./crypto.js";
import { GOOGLE_DISCOVERY_URL, GOOGLE_ISSUER } from "./providers.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

// Tolerância de relógio entre a Cloudflare e o Google.
const CLOCK_SKEW_SECONDS = 120;

function decodeJsonSegment(segment) {
  return JSON.parse(decoder.decode(base64UrlToBytes(segment)));
}

/** Documento de descoberta OIDC do emissor esperado. */
export async function googleDiscovery() {
  const response = await fetch(GOOGLE_DISCOVERY_URL, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!response.ok) throw new Error("descoberta_indisponivel");
  const document = await response.json();
  if (document.issuer !== GOOGLE_ISSUER) throw new Error("emissor_inesperado");
  return document;
}

async function importJwk(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Valida o id_token e devolve as reivindicações confiáveis.
 * Lança um Error com um código curto quando qualquer conferência falha.
 */
export async function verifyGoogleIdToken(idToken, expectedAudience, expectedNonce) {
  if (typeof idToken !== "string") throw new Error("id_token_ausente");

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token_malformado");

  const header = decodeJsonSegment(parts[0]);
  if (header.alg !== "RS256") throw new Error("algoritmo_invalido");
  if (!header.kid) throw new Error("kid_ausente");

  const discovery = await googleDiscovery();

  const jwksResponse = await fetch(discovery.jwks_uri, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!jwksResponse.ok) throw new Error("jwks_indisponivel");
  const { keys } = await jwksResponse.json();

  const jwk = Array.isArray(keys)
    ? keys.find((key) => key.kid === header.kid && key.kty === "RSA")
    : null;
  if (!jwk) throw new Error("chave_desconhecida");

  const publicKey = await importJwk(jwk);
  const signature = base64UrlToBytes(parts[2]);
  const signedData = encoder.encode(`${parts[0]}.${parts[1]}`);

  const isValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    signature,
    signedData,
  );
  if (!isValid) throw new Error("assinatura_invalida");

  // A partir daqui a assinatura é confiável; falta a validação semântica.
  const claims = decodeJsonSegment(parts[1]);
  const now = nowInSeconds();

  if (claims.iss !== discovery.issuer) throw new Error("iss_invalido");

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(expectedAudience)) throw new Error("aud_invalido");
  if (claims.azp && claims.azp !== expectedAudience) throw new Error("azp_invalido");

  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) {
    throw new Error("token_expirado");
  }
  if (typeof claims.iat !== "number" || claims.iat - CLOCK_SKEW_SECONDS > now) {
    throw new Error("iat_invalido");
  }
  if (!expectedNonce || claims.nonce !== expectedNonce) throw new Error("nonce_invalido");
  if (!claims.sub) throw new Error("subject_ausente");

  return claims;
}
