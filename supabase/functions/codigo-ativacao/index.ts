// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: codigo-ativacao
// Troca o token de uso único (entregue no fragment da URL pelo
// oauth-callback) pelo código de ativação do cliente.
//   POST { t } → { codigo, email, wa_url }
// Token inválido, expirado ou já usado → 401 token_invalido
// (mesma resposta nos três casos: não vira oráculo).
// Config: Verify JWT = OFF. CORS travado no site.
// ═════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NUMERO_WA = "5513996286090";

const ORIGENS = new Set([
  "https://usenotinha.com.br",
  "https://www.usenotinha.com.br",
]);

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.has(o) ? o : "https://usenotinha.com.br",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function sb() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

function json(req: Request, o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json", ...cors(req) },
  });
}

async function sha256hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { erro: "method_not_allowed" }, 405);

  let b: any;
  try { b = await req.json(); } catch { return json(req, { erro: "json_invalido" }, 400); }

  const t = String(b?.t ?? "").trim();
  if (!t || t.length > 128) return json(req, { erro: "token_invalido" }, 401);

  try {
    const hash = await sha256hex(t);
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ativacao_tokens?token_hash=eq.${hash}&usado_em=is.null&select=id,cliente_id,expira_em`,
      { headers: sb() });
    const row = (await r.json())?.[0];
    if (!row) return json(req, { erro: "token_invalido" }, 401);
    if (new Date(row.expira_em) < new Date()) return json(req, { erro: "token_invalido" }, 401);

    // queima o token antes de devolver o código
    const rUso = await fetch(`${SUPABASE_URL}/rest/v1/ativacao_tokens?id=eq.${row.id}&usado_em=is.null`, {
      method: "PATCH",
      headers: { ...sb(), Prefer: "return=representation" },
      body: JSON.stringify({ usado_em: new Date().toISOString() }),
    });
    if (((await rUso.json()) ?? []).length === 0) return json(req, { erro: "token_invalido" }, 401);

    const rCli = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?id=eq.${row.cliente_id}&select=codigo_ativacao,google_email,email`,
      { headers: sb() });
    const cli = (await rCli.json())?.[0];
    if (!cli?.codigo_ativacao) return json(req, { erro: "token_invalido" }, 401);

    return json(req, {
      codigo: cli.codigo_ativacao,
      email: cli.google_email ?? cli.email ?? "",
      wa_url: `https://wa.me/${NUMERO_WA}?text=${encodeURIComponent("ATIVAR " + cli.codigo_ativacao)}`,
    });
  } catch (e) {
    console.error("codigo-ativacao excecao", String(e));
    return json(req, { erro: "token_invalido" }, 401);
  }
});
