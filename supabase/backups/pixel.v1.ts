// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: pixel
// Rastreio de e-mail transacional.
//   GET /pixel?id={log_id}        → conta abertura, devolve GIF 1×1
//   GET /pixel?id={log_id}&r=wa   → conta clique, redireciona pro WhatsApp
//                                    com ATIVAR {codigo} pré-escrito
// Sem auth (precisa ser público pro cliente de e-mail carregar).
// UUID inválido = ignorado. Verify JWT = OFF.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NUMERO_WA = "5513996286090";

// GIF transparente 1×1
const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sb() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

function gif(): Response {
  return new Response(GIF, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? "";
  const modo = u.searchParams.get("r");

  // id inválido → responde neutro, sem tocar no banco
  if (!UUID_RE.test(id)) {
    return modo === "wa"
      ? Response.redirect(`https://wa.me/${NUMERO_WA}`, 302)
      : gif();
  }

  try {
    if (modo === "wa") {
      // clique: incrementa e redireciona com o código do cliente
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/emails_log?id=eq.${id}&select=cliques,clicado_em,cliente_id,clientes(codigo_ativacao)`,
        { headers: sb() },
      );
      const row = (await r.json())?.[0];
      const codigo = row?.clientes?.codigo_ativacao ?? "";
      if (row) {
        await fetch(`${SUPABASE_URL}/rest/v1/emails_log?id=eq.${id}`, {
          method: "PATCH",
          headers: sb(),
          body: JSON.stringify({
            cliques: (row.cliques ?? 0) + 1,
            clicado_em: row.clicado_em ?? new Date().toISOString(),
          }),
        });
      }
      const texto = codigo ? `?text=${encodeURIComponent("ATIVAR " + codigo)}` : "";
      return Response.redirect(`https://wa.me/${NUMERO_WA}${texto}`, 302);
    }

    // abertura: incrementa e devolve o gif
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/emails_log?id=eq.${id}&select=abertos,aberto_em`,
      { headers: sb() },
    );
    const row = (await r.json())?.[0];
    if (row) {
      await fetch(`${SUPABASE_URL}/rest/v1/emails_log?id=eq.${id}`, {
        method: "PATCH",
        headers: sb(),
        body: JSON.stringify({
          abertos: (row.abertos ?? 0) + 1,
          aberto_em: row.aberto_em ?? new Date().toISOString(),
        }),
      });
    }
    return gif();
  } catch (e) {
    console.error("pixel excecao", String(e));
    return modo === "wa" ? Response.redirect(`https://wa.me/${NUMERO_WA}`, 302) : gif();
  }
});
