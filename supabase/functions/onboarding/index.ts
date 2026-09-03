// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: onboarding
// Recebe o cadastro do site → cria cliente no Supabase → cria cliente
// e assinatura no Asaas (sandbox) → devolve o link de pagamento e a
// URL de conexão do Google Drive (OAuth, state opaco em oauth_states).
//
// Config da função: Verify JWT = OFF (o navegador chama sem JWT).
//
// Secrets:
//   ASAAS_API_KEY        (chave do sandbox: $aact_hmlg_...)
//   ASAAS_BASE_URL       (opcional; default sandbox)
//   GOOGLE_CLIENT_ID     (já existe)
//   TURNSTILE_SECRET     (par da sitekey usada no formulário)
//   TURNSTILE_MODO       (opcional: "permissivo" | "estrito"; default permissivo)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticos)
// ═════════════════════════════════════════════════════════════════

const ASAAS_BASE       = Deno.env.get("ASAAS_BASE_URL") ?? "https://api-sandbox.asaas.com/v3";
const ASAAS_KEY        = Deno.env.get("ASAAS_API_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OAUTH_REDIRECT = "https://xpzjwlhrlebdpcybxaxu.supabase.co/functions/v1/oauth-callback";
const SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") ?? "";
// "permissivo": valida e loga, mas deixa passar. "estrito": recusa sem token válido.
const TURNSTILE_MODO   = (Deno.env.get("TURNSTILE_MODO") ?? "permissivo").toLowerCase();
const SIGNUP_MAX_HORA  = 5;

const PLANOS: Record<string, number> = { base: 14.90, premium: 44.90 };

const ORIGENS = new Set([
  "https://usenotinha.com.br",
  "https://www.usenotinha.com.br",
]);

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.has(o) ? o : "https://usenotinha.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function asaasHeaders() {
  return { access_token: ASAAS_KEY, "Content-Type": "application/json", "User-Agent": "Notinha" };
}
function sbHeaders(extra: Record<string, string> = {}) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...extra };
}
function json(req: Request, obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

// Ordem importa: atrás do Worker da Cloudflare o x-forwarded-for vira o IP do
// proxy e o rate limit passaria a bloquear todo mundo junto.
function ipDaReq(req: Request): string {
  const real = (req.headers.get("x-real-ip") ?? "").trim();
  if (real) return real;
  const cf = (req.headers.get("cf-connecting-ip") ?? "").trim();
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return (xff.split(",")[0] ?? "").trim() || "desconhecido";
}

// Turnstile: valida o token do formulário. Devolve true/false.
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

async function signupRateHit(ip: string): Promise<number | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/signup_rate_hit`, {
      method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_ip: ip }),
    });
    if (!r.ok) { console.error("signup_rate_hit", await r.text()); return null; }
    const n = await r.json();
    return typeof n === "number" ? n : null;
  } catch (e) {
    console.error("signup_rate_hit excecao", String(e));
    return null;
  }
}

// Asaas 4xx = dado que o cliente digitou (CPF inválido, e-mail malformado).
// A descrição vem pronta e legível — repassa. 5xx e resposta sem corpo são
// falha de infraestrutura, aí sim 502.
function erroAsaas(res: Response, data: any): { status: number; body: Record<string, unknown> } {
  const desc = data?.errors?.[0]?.description;
  const code = data?.errors?.[0]?.code ?? null;
  if (desc && res.status >= 400 && res.status < 500) {
    // `error` carrega a frase porque é o campo que a página de cadastro exibe
    return { status: 400, body: { error: String(desc), error_code: "dados_invalidos", asaas_code: code } };
  }
  return { status: 502, body: { error: "asaas_indisponivel", error_code: "infra", detalhe: data } };
}

async function sbInsert(table: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: sbHeaders({ Prefer: "return=representation" }), body: JSON.stringify(body),
  });
  if (!r.ok) { console.error("sbInsert", await r.text()); return null; }
  const j = await r.json();
  return Array.isArray(j) ? j[0] : j;
}
// ── State opaco do OAuth: uso único, resolvido pelo oauth-callback ──
async function sha256hex(v: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function novoToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// O default da tabela é 30 minutos, que serve para um clique imediato no
// navegador. Link que viaja por e-mail precisa de janela maior, senão chega
// morto — por isso a validade é sempre explícita aqui.
async function criarState(clienteId: string, horas: number): Promise<string | null> {
  const t = novoToken();
  const expira = new Date(Date.now() + horas * 3600 * 1000).toISOString();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/oauth_states`, {
    method: "POST", headers: sbHeaders(),
    body: JSON.stringify({ state_hash: await sha256hex(t), cliente_id: clienteId, expira_em: expira }),
  });
  if (!r.ok) { console.error("oauth_states insert", await r.text()); return null; }
  return t;
}

async function sbPatch(path: string, body: unknown) {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "PATCH", headers: sbHeaders(), body: JSON.stringify(body) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  let b: any;
  try { b = await req.json(); } catch { return json(req, { error: "json_invalido" }, 400); }

  const ip = ipDaReq(req);

  // (a) Turnstile — antes de qualquer escrita e antes de falar com o Asaas.
  const tsOk = await turnstileOk(String(b.turnstile ?? ""), ip);
  if (!tsOk) {
    console.log(`turnstile falhou ip=${ip} modo=${TURNSTILE_MODO} token=${b.turnstile ? "presente" : "ausente"}`);
    if (TURNSTILE_MODO === "estrito") return json(req, { error: "captcha" }, 403);
  }

  // (b) Rate limit por IP.
  const tentativas = await signupRateHit(ip);
  if (tentativas !== null && tentativas > SIGNUP_MAX_HORA) {
    console.log(`signup rate limit ip=${ip} tentativas=${tentativas}`);
    return json(req, { error: "muitas_tentativas" }, 429);
  }

  const nome  = String(b.nome ?? "").trim();
  const cpf   = String(b.cpf ?? "").replace(/\D/g, "");
  const email = String(b.email ?? "").trim();
  let   tel   = String(b.whatsapp ?? "").replace(/\D/g, "");
  const nascimento = b.nascimento || null;             // YYYY-MM-DD
  const plano = b.plano === "premium" ? "premium" : "base";
  const consent = !!b.consent;

  if (!nome || !cpf || !email || !tel || !consent) return json(req, { error: "campos_obrigatorios" }, 400);
  if (!tel.startsWith("55")) tel = "55" + tel;          // formato wa_id

  try {
    // 1) cliente no Supabase (telefone é best-effort; a ativação reconfirma o número real)
    const cli = await sbInsert("clientes", {
      nome, email, telefone: tel, data_nascimento: nascimento,
      plano_tier: plano, aceitou_termos: true, data_aceite: new Date().toISOString(),
      versao_termos_aceitos: "1.0", pais: "BR", pagamento_status: "pendente",
    });
    if (!cli) return json(req, { error: "cliente_ja_existe_ou_falhou" }, 409);

    // 2) cliente no Asaas
    const custRes = await fetch(`${ASAAS_BASE}/customers`, {
      method: "POST", headers: asaasHeaders(),
      body: JSON.stringify({ name: nome, cpfCnpj: cpf, email, mobilePhone: tel.slice(2), externalReference: cli.id }),
    });
    const cust = await custRes.json();
    if (!cust.id) {
      console.error("asaas customer", custRes.status, JSON.stringify(cust));
      const e = erroAsaas(custRes, cust);
      return json(req, e.body, e.status);
    }

    // 3) assinatura mensal
    const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const subRes = await fetch(`${ASAAS_BASE}/subscriptions`, {
      method: "POST", headers: asaasHeaders(),
      body: JSON.stringify({
        customer: cust.id, billingType: "UNDEFINED", value: PLANOS[plano],
        nextDueDate: hoje, cycle: "MONTHLY", description: `Notinha ${plano}`, externalReference: cli.id,
      }),
    });
    const sub = await subRes.json();
    if (!sub.id) {
      console.error("asaas sub", subRes.status, JSON.stringify(sub));
      const e = erroAsaas(subRes, sub);
      return json(req, e.body, e.status);
    }

    // 4) link de pagamento da 1ª cobrança
    let paymentUrl: string | null = null;
    const payRes = await fetch(`${ASAAS_BASE}/subscriptions/${sub.id}/payments`, { headers: asaasHeaders() });
    const pays = await payRes.json();
    if (pays?.data?.[0]) paymentUrl = pays.data[0].invoiceUrl;

    // 5) grava ids do Asaas
    await sbPatch(`clientes?id=eq.${cli.id}`, { asaas_customer_id: cust.id, asaas_subscription_id: sub.id });

    // 6) URL de conexão do Drive (OAuth) — state opaco, nunca o cliente_id cru
    const stateToken = await criarState(cli.id, 24);  // clique vem logo depois do cadastro
    if (!stateToken) return json(req, { error: "falha_state", cliente_id: cli.id }, 500);

    const oauthUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, redirect_uri: OAUTH_REDIRECT, response_type: "code",
      scope: SCOPE, access_type: "offline", prompt: "consent", state: stateToken,
    }).toString();

    return json(req, { cliente_id: cli.id, payment_url: paymentUrl, oauth_url: oauthUrl });
  } catch (e) {
    console.error("onboarding erro", String(e));
    return json(req, { error: "interno" }, 500);
  }
});
