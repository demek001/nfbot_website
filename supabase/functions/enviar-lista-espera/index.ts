// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: enviar-lista-espera
// Confirmação de entrada na lista de espera (leads_interesse) via
// Zoho Mail API — mesmo pipeline da enviar-boasvindas (v7).
// Disparo: trigger novo_lead_email (AFTER INSERT em leads_interesse)
// ou chamada manual. Aceita os dois formatos de body:
//   { "lead_id": 14 }                          (manual)
//   { "record": { "id": 14, ... }, ... }       (supabase_functions.http_request)
// Idempotência: emails_log com tipo=lista_espera + ref_externa=lead:<id>
// + status=enviado → nunca reenvia. cliente_id fica NULL (lead não é
// cliente; FK de emails_log aponta pra clientes).
// Auth: header x-webhook-token = WEBHOOK_TOKEN.
// ═════════════════════════════════════════════════════════════════

import { TPL_LISTA_ESPERA } from "./templates-lista.ts";

const WEBHOOK_TOKEN      = Deno.env.get("WEBHOOK_TOKEN")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZOHO_CLIENT_ID     = Deno.env.get("ZOHO_CLIENT_ID")!;
const ZOHO_CLIENT_SECRET = Deno.env.get("ZOHO_CLIENT_SECRET")!;
const ZOHO_ACCOUNTS_URL  = Deno.env.get("ZOHO_ACCOUNTS_URL") ?? "https://accounts.zoho.com";
const ZOHO_MAIL_API      = "https://mail.zoho.com";

const EMAIL_ENVIO = "contato@usenotinha.com.br";
const REMETENTE   = `Notinha <${EMAIL_ENVIO}>`;
const ASSUNTO     = "Você entrou na lista de espera do Notinha 🎉";

function sb(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// Merge de placeholders {chave} → valor (só minúsculas e underscore)
function merge(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([a-z_]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// Refresh token: secret (se existir) ou tabela config_privada (gravado pelo setup)
let cachedRefresh: string | null = Deno.env.get("ZOHO_MAIL_REFRESH_TOKEN") ?? null;
async function zohoRefreshToken(): Promise<string> {
  if (cachedRefresh) return cachedRefresh;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/config_privada?k=eq.ZOHO_MAIL_REFRESH_TOKEN&select=v`,
    { headers: sb() },
  );
  const v = (await r.json())?.[0]?.v;
  if (!v) throw new Error("refresh token não configurado (config_privada)");
  cachedRefresh = v;
  return v;
}

async function zohoToken(): Promise<string> {
  const refresh = await zohoRefreshToken();
  const p = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: refresh,
  });
  const r = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token?${p}`, { method: "POST" });
  const j = await r.json();
  if (!j.access_token) throw new Error("zoho token: " + JSON.stringify(j));
  return j.access_token;
}

// Descobre o accountId do contato@ (cacheado por instância)
let cachedAccountId: string | null = null;
async function zohoAccountId(token: string): Promise<string> {
  if (cachedAccountId) return cachedAccountId;
  const r = await fetch(`${ZOHO_MAIL_API}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const j = await r.json();
  const contas = j?.data ?? [];
  const alvo = contas.find((a: any) =>
    (a.primaryEmailAddress ?? "").toLowerCase() === EMAIL_ENVIO ||
    (a.mailboxAddress ?? "").toLowerCase().includes("contato")) ?? contas[0];
  if (!alvo?.accountId) throw new Error("zoho accountId não encontrado: " + JSON.stringify(j));
  cachedAccountId = String(alvo.accountId);
  return cachedAccountId;
}

// Envio genérico via Zoho Mail API. Devolve { ok, resp } — nunca lança.
async function zohoEnviar(
  para: string, assunto: string, html: string, de = REMETENTE,
): Promise<{ ok: boolean; resp: any }> {
  try {
    const token = await zohoToken();
    const accountId = await zohoAccountId(token);
    const rz = await fetch(`${ZOHO_MAIL_API}/api/accounts/${accountId}/messages`, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAddress: de,
        toAddress: para,
        subject: assunto,
        content: html,
        mailFormat: "html",
      }),
    });
    const jz = await rz.json().catch(() => ({}));
    return { ok: rz.ok && (jz?.status?.code === 200 || !!jz?.data), resp: jz };
  } catch (e) {
    return { ok: false, resp: { error: String(e) } };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  if (req.headers.get("x-webhook-token") !== WEBHOOK_TOKEN) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad_json", { status: 400 }); }
  // Aceita { lead_id } (manual) e { record: { id } } (payload do trigger)
  const leadId = Number(body?.lead_id ?? body?.record?.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return new Response("lead_id_obrigatorio", { status: 400 });
  }
  const ref = `lead:${leadId}`;

  const out = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

  try {
    // 1. Lead
    const rl = await fetch(
      `${SUPABASE_URL}/rest/v1/leads_interesse?id=eq.${leadId}&select=id,nome,email,telefone,codigo_indicacao,criado_em`,
      { headers: sb() },
    );
    const lead = (await rl.json())?.[0];
    if (!lead) return out({ ok: false, motivo: "lead_nao_encontrado" });
    if (!lead.email) return out({ ok: false, motivo: "sem_email" });
    if (!lead.codigo_indicacao) return out({ ok: false, motivo: "sem_codigo_indicacao" });

    // 2. Idempotência: 1 confirmação por lead, pra sempre
    const rj = await fetch(
      `${SUPABASE_URL}/rest/v1/emails_log?tipo=eq.lista_espera&ref_externa=eq.${ref}&status=eq.enviado&select=id&limit=1`,
      { headers: sb() },
    );
    if (((await rj.json()) ?? []).length > 0) return out({ ok: true, ja_enviado: true });

    // 3. Cria o registro do log (id vira o rastreador do pixel)
    const ri = await fetch(`${SUPABASE_URL}/rest/v1/emails_log`, {
      method: "POST",
      headers: sb({ Prefer: "return=representation" }),
      body: JSON.stringify({ tipo: "lista_espera", email_para: lead.email, ref_externa: ref }),
    });
    const log = (await ri.json())?.[0];
    if (!log?.id) return out({ ok: false, motivo: "falha_log" }, 500);

    // 4. Monta e envia
    const primeiroNome = (lead.nome ?? "").split(" ")[0];
    // Sem nome, o H1 vira "Parabéns! 🎉" — nunca "Parabéns, ! 🎉"
    const tpl = primeiroNome
      ? TPL_LISTA_ESPERA
      : TPL_LISTA_ESPERA.replace("Parabéns, {primeiro_nome}! 🎉", "Parabéns! 🎉");
    const html = merge(tpl, {
      primeiro_nome: primeiroNome,
      codigo_indicacao: String(lead.codigo_indicacao),
      pixel_url: `${SUPABASE_URL}/functions/v1/pixel?id=${log.id}`,
    });
    const envio = await zohoEnviar(lead.email, ASSUNTO, html);

    // 5. Atualiza o log
    await fetch(`${SUPABASE_URL}/rest/v1/emails_log?id=eq.${log.id}`, {
      method: "PATCH",
      headers: sb(),
      body: JSON.stringify(
        envio.ok ? { status: "enviado" }
                 : { status: "falhou", erro: JSON.stringify(envio.resp).slice(0, 500) },
      ),
    });

    if (!envio.ok) {
      console.error("zoho mail falhou", JSON.stringify(envio.resp));
      return out({ ok: false, zoho: envio.resp });
    }
    console.log(`lista_espera enviado lead=${leadId} log=${log.id}`);
    return out({ ok: true, log_id: log.id });
  } catch (e) {
    console.error("enviar-lista-espera excecao", String(e));
    return out({ ok: false, error: String(e) }, 500);
  }
});
