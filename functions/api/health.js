// Rota de sanidade: confirma que a pasta functions foi reconhecida.
export function onRequestGet() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
