// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: contato
// Recebe o formulário de contato do site, valida o Turnstile e grava
// em mensagens_contato com service role. O trigger da tabela segue
// chamando notificar-contato como hoje.
//
// Existe para tirar a anon key da página e fechar INSERT direto na
// tabela para o papel anon.
//
//   POST { nome, email, telefone, cpf, motivo, mensagem, origem,
//          origem_url, indicado_por, user_agent, referrer, turnstile }
//
// Config: Verify JWT = OFF. CORS travado no site.
// Secrets: TURNSTILE_SECRET, TURNSTILE_MODO (opcional),
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═════════════════════════════════════════════════════════════════

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") ?? "";
// "permissivo": valida e loga, mas deixa passar. "estrito": recusa sem token.
const TURNSTILE_MODO   = (Deno.env.get("TURNSTILE_MODO") ?? "permissivo").toLowerCase();

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
    Prefer: "return=minimal",
  };
}

function json(req: Request, o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json", ...cors(req) },
  });
}

function ipDaReq(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return (xff.split(",")[0] ?? "").trim() || req.headers.get("cf-connecting-ip") || "desconhecido";
}

async function turnstileOk(token: string, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) { console.error("TURNSTILE_SECRET ausente"); return false; }
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    return !!(await r.json())?.success;
  } catch (e) {
    console.error("turnstile excecao", String(e));
    return false;
  }
}

function txt(v: unknown, max: number): string | null {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { erro: "method_not_allowed" }, 405);

  let b: any;
  try { b = await req.json(); } catch { return json(req, { erro: "json_invalido" }, 400); }

  const ip = ipDaReq(req);
  const tsOk = await turnstileOk(String(b.turnstile ?? ""), ip);
  if (!tsOk) {
    console.log(`turnstile falhou ip=${ip} modo=${TURNSTILE_MODO} token=${b.turnstile ? "presente" : "ausente"}`);
    if (TURNSTILE_MODO === "estrito") return json(req, { erro: "captcha" }, 403);
  }

  const nome     = txt(b.nome, 120);
  const email    = txt(b.email, 160)?.toLowerCase() ?? null;
  const telefone = String(b.telefone ?? "").replace(/\D/g, "").slice(0, 15) || null;
  const cpf      = String(b.cpf ?? "").replace(/\D/g, "").slice(0, 14) || null;
  const motivo   = txt(b.motivo, 60);
  const mensagem = txt(b.mensagem, 4000);

  if (!nome || !email || !mensagem) return json(req, { erro: "campos_obrigatorios" }, 400);

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/mensagens_contato`, {
      method: "POST",
      headers: sb(),
      body: JSON.stringify({
        nome, email, telefone, cpf, motivo, mensagem,
        origem: txt(b.origem, 40) ?? "site_contato",
        origem_url: txt(b.origem_url, 500),
        indicado_por: txt(b.indicado_por, 120),
        user_agent: txt(b.user_agent, 500),
        referrer: txt(b.referrer, 500),
      }),
    });
    if (!r.ok) {
      console.error("insert mensagens_contato", r.status, await r.text());
      return json(req, { erro: "falha_gravar" }, 500);
    }
    return json(req, { ok: true });
  } catch (e) {
    console.error("contato excecao", String(e));
    return json(req, { erro: "falha_gravar" }, 500);
  }
});
