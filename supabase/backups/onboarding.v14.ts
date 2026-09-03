// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: onboarding
// Recebe o cadastro do site → cria cliente no Supabase → cria cliente
// e assinatura no Asaas (sandbox) → devolve o link de pagamento e a
// URL de conexão do Google Drive (OAuth, state = cliente_id).
//
// Config da função: Verify JWT = OFF (o navegador chama sem JWT).
//
// Secrets:
//   ASAAS_API_KEY        (chave do sandbox: $aact_hmlg_...)
//   ASAAS_BASE_URL       (opcional; default sandbox)
//   GOOGLE_CLIENT_ID     (já existe)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticos)
// ═════════════════════════════════════════════════════════════════

const ASAAS_BASE       = Deno.env.get("ASAAS_BASE_URL") ?? "https://api-sandbox.asaas.com/v3";
const ASAAS_KEY        = Deno.env.get("ASAAS_API_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OAUTH_REDIRECT = "https://xpzjwlhrlebdpcybxaxu.supabase.co/functions/v1/oauth-callback";
const SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

const PLANOS: Record<string, number> = { base: 14.90, premium: 44.90 };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function asaasHeaders() {
  return { access_token: ASAAS_KEY, "Content-Type": "application/json", "User-Agent": "Notinha" };
}
function sbHeaders(extra: Record<string, string> = {}) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...extra };
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function sbInsert(table: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: sbHeaders({ Prefer: "return=representation" }), body: JSON.stringify(body),
  });
  if (!r.ok) { console.error("sbInsert", await r.text()); return null; }
  const j = await r.json();
  return Array.isArray(j) ? j[0] : j;
}
async function sbPatch(path: string, body: unknown) {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "PATCH", headers: sbHeaders(), body: JSON.stringify(body) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let b: any;
  try { b = await req.json(); } catch { return json({ error: "json_invalido" }, 400); }

  const nome  = String(b.nome ?? "").trim();
  const cpf   = String(b.cpf ?? "").replace(/\D/g, "");
  const email = String(b.email ?? "").trim();
  let   tel   = String(b.whatsapp ?? "").replace(/\D/g, "");
  const nascimento = b.nascimento || null;             // YYYY-MM-DD
  const plano = b.plano === "premium" ? "premium" : "base";
  const consent = !!b.consent;

  if (!nome || !cpf || !email || !tel || !consent) return json({ error: "campos_obrigatorios" }, 400);
  if (!tel.startsWith("55")) tel = "55" + tel;          // formato wa_id

  try {
    // 1) cliente no Supabase (telefone é best-effort; a ativação reconfirma o número real)
    const cli = await sbInsert("clientes", {
      nome, email, telefone: tel, data_nascimento: nascimento,
      plano_tier: plano, aceitou_termos: true, data_aceite: new Date().toISOString(),
      versao_termos_aceitos: "1.0", pais: "BR", pagamento_status: "pendente",
    });
    if (!cli) return json({ error: "cliente_ja_existe_ou_falhou" }, 409);

    // 2) cliente no Asaas
    const custRes = await fetch(`${ASAAS_BASE}/customers`, {
      method: "POST", headers: asaasHeaders(),
      body: JSON.stringify({ name: nome, cpfCnpj: cpf, email, mobilePhone: tel.slice(2), externalReference: cli.id }),
    });
    const cust = await custRes.json();
    if (!cust.id) { console.error("asaas customer", JSON.stringify(cust)); return json({ error: "asaas_customer", detalhe: cust }, 502); }

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
    if (!sub.id) { console.error("asaas sub", JSON.stringify(sub)); return json({ error: "asaas_subscription", detalhe: sub }, 502); }

    // 4) link de pagamento da 1ª cobrança
    let paymentUrl: string | null = null;
    const payRes = await fetch(`${ASAAS_BASE}/subscriptions/${sub.id}/payments`, { headers: asaasHeaders() });
    const pays = await payRes.json();
    if (pays?.data?.[0]) paymentUrl = pays.data[0].invoiceUrl;

    // 5) grava ids do Asaas
    await sbPatch(`clientes?id=eq.${cli.id}`, { asaas_customer_id: cust.id, asaas_subscription_id: sub.id });

    // 6) URL de conexão do Drive (OAuth)
    const oauthUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, redirect_uri: OAUTH_REDIRECT, response_type: "code",
      scope: SCOPE, access_type: "offline", prompt: "consent", state: cli.id,
    }).toString();

    return json({ cliente_id: cli.id, payment_url: paymentUrl, oauth_url: oauthUrl });
  } catch (e) {
    console.error("onboarding erro", String(e));
    return json({ error: "interno" }, 500);
  }
});
