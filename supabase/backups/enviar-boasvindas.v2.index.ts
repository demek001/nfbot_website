// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: enviar-boasvindas
// Envia o e-mail transacional de boas-vindas + código de ativação
// via Zoho Mail API. Remetente exibido: "Notinha <contato@usenotinha.com.br>".
// Idempotente: 1 envio por cliente (checa emails_log).
// Rastreio: pixel de abertura + redirect de clique via função "pixel".
// Auth: header x-webhook-token = WEBHOOK_TOKEN.
// ═════════════════════════════════════════════════════════════════

const WEBHOOK_TOKEN      = Deno.env.get("WEBHOOK_TOKEN")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZOHO_CLIENT_ID     = Deno.env.get("ZOHO_CLIENT_ID")!;
const ZOHO_CLIENT_SECRET = Deno.env.get("ZOHO_CLIENT_SECRET")!;
const ZOHO_ACCOUNTS_URL  = Deno.env.get("ZOHO_ACCOUNTS_URL") ?? "https://accounts.zoho.com";
const ZOHO_MAIL_API      = "https://mail.zoho.com";

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

const EMAIL_ENVIO = "contato@usenotinha.com.br";
const REMETENTE   = `Notinha <${EMAIL_ENVIO}>`;   // nome exibido na caixa de entrada
const NUMERO_WA   = "5513996286090";
const CONTA       = "https://usenotinha.com.br/conta";
const SUPORTE     = "https://usenotinha.com.br/contato";

function sb(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
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

// ── Template (design do site: tema escuro, Fraunces + DM Sans) ──
function htmlEmail(nome: string, codigo: string, logId: string): string {
  const BG = "#0d1117", SURFACE = "#161b22", BORDER = "#30363d";
  const TEXT = "#e6edf3", MUTED = "#8b949e", BODYC = "#c9d4dd";
  const BRAND = "#288A89", BRANDH = "#2EA09E", WAG = "#25D366";
  const FH = "'Fraunces', Georgia, 'Times New Roman', serif";
  const FB = "'DM Sans', Arial, Helvetica, sans-serif";
  const pixelUrl = `${SUPABASE_URL}/functions/v1/pixel?id=${logId}`;
  const waUrl    = `${SUPABASE_URL}/functions/v1/pixel?id=${logId}&r=wa`;

  const P = (t: string, c = BODYC) =>
    `<tr><td style="padding:0 32px;"><p style="margin:0 0 16px 0;font-family:${FB};font-size:16px;line-height:1.65;font-weight:400;color:${c};">${t}</p></td></tr>`;
  const BTN = (label: string, url: string, cor: string) =>
    `<tr><td style="padding:8px 32px 24px 32px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:100px;background-color:${cor};text-align:center;"><a href="${url}" style="display:inline-block;padding:15px 40px;font-family:${FB};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">${label}</a></td></tr></table></td></tr>`;
  const B = (t: string) => `<strong style="color:${TEXT};font-weight:600;">${t}</strong>`;

  const corpo =
    P(`Oi, ${nome}! Teu pagamento foi confirmado e tua assinatura do Notinha já está ativa.`) +
    P(`Agora são só ${B("2 passos")} pra tudo começar a funcionar:`) +
    P(`${B("1. Cria tua senha de acesso.")} É no botão “Primeiro acesso” da tua página de conta — leva 1 minuto:`) +
    BTN("Criar minha senha →", CONTA, BRAND) +
    P(`${B("2. Ativa o Notinha no WhatsApp.")} Clica no botão abaixo — ele abre o WhatsApp com a mensagem de ativação já escrita. É só apertar enviar:`) +
    BTN("Ativar no WhatsApp →", waUrl, WAG) +
    P("Se o botão não abrir, manda esta mensagem no nosso WhatsApp:", MUTED) +
    `<tr><td style="padding:0 32px 20px 32px;" align="center"><span style="display:inline-block;background:${BG};border:1px dashed ${BRAND};border-radius:8px;padding:14px 28px;font-family:'Courier New',Courier,monospace;font-size:18px;letter-spacing:1px;color:${TEXT};">ATIVAR ${codigo}</span></td></tr>` +
    P("Assim que ativar, teu assistente acorda e cria tua planilha no Google Drive.") +
    P(`Qualquer dúvida de uso, o guia completo está na tua conta, seção ${B("Como Usar")}: <a href="${CONTA}" style="color:${BRANDH};text-decoration:underline;">usenotinha.com.br/conta</a>`);

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>Pagamento confirmado</title></head>
<body style="margin:0;padding:0;background-color:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Dois passos e teu Notinha entra em ação.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${SURFACE};border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
<tr><td style="padding:28px 32px;border-bottom:1px solid ${BORDER};" align="center">
<span style="font-family:${FH};font-size:28px;font-weight:800;color:${BRAND};">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:${FH};font-size:26px;line-height:1.25;font-weight:800;color:${TEXT};">Pagamento confirmado 🎉</h1></td></tr>
${corpo}
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid ${BORDER};">
<p style="margin:0;font-family:${FB};font-size:12px;line-height:1.6;color:${MUTED};">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
Você recebeu este e-mail porque tem uma assinatura ativa do Notinha.<br>
Precisa de ajuda? <a href="${SUPORTE}" style="color:${BRANDH};text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  if (req.headers.get("x-webhook-token") !== WEBHOOK_TOKEN) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad_json", { status: 400 }); }
  const clienteId = body?.cliente_id;
  if (!clienteId) return new Response("cliente_id_obrigatorio", { status: 400 });

  const out = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

  try {
    // 1. Cliente
    const rc = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}&select=id,nome,email,codigo_ativacao,pagamento_status`,
      { headers: sb() },
    );
    const c = (await rc.json())?.[0];
    if (!c)                  return out({ ok: false, motivo: "cliente_nao_encontrado" });
    if (!c.email)            return out({ ok: false, motivo: "sem_email" });
    if (!c.codigo_ativacao)  return out({ ok: false, motivo: "sem_codigo" });

    // 2. Idempotência: já enviado antes → não reenvia (renovação mensal)
    const rj = await fetch(
      `${SUPABASE_URL}/rest/v1/emails_log?cliente_id=eq.${clienteId}&tipo=eq.boas_vindas&status=eq.enviado&select=id&limit=1`,
      { headers: sb() },
    );
    if (((await rj.json()) ?? []).length > 0) return out({ ok: true, ja_enviado: true });

    // 3. Cria o registro do log (id vira o rastreador do pixel)
    const ri = await fetch(`${SUPABASE_URL}/rest/v1/emails_log`, {
      method: "POST",
      headers: sb({ Prefer: "return=representation" }),
      body: JSON.stringify({ cliente_id: clienteId, tipo: "boas_vindas", email_para: c.email }),
    });
    const log = (await ri.json())?.[0];
    if (!log?.id) return out({ ok: false, motivo: "falha_log" }, 500);

    // 4. Envia via Zoho Mail API
    const nome = (c.nome ?? "").split(" ")[0] || "tudo bem";
    const token = await zohoToken();
    const accountId = await zohoAccountId(token);
    const rz = await fetch(`${ZOHO_MAIL_API}/api/accounts/${accountId}/messages`, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAddress: REMETENTE,
        toAddress: c.email,
        subject: "Pagamento confirmado — bora ativar 🎉",
        content: htmlEmail(nome, c.codigo_ativacao, log.id),
        mailFormat: "html",
      }),
    });
    const jz = await rz.json().catch(() => ({}));

    // 5. Atualiza o log
    const okEnvio = rz.ok && (jz?.status?.code === 200 || jz?.data);
    await fetch(`${SUPABASE_URL}/rest/v1/emails_log?id=eq.${log.id}`, {
      method: "PATCH",
      headers: sb(),
      body: JSON.stringify(
        okEnvio ? { status: "enviado" }
                : { status: "falhou", erro: JSON.stringify(jz).slice(0, 500) },
      ),
    });

    if (!okEnvio) { console.error("zoho mail falhou", JSON.stringify(jz)); return out({ ok: false, zoho: jz }); }
    console.log(`boas-vindas enviado cliente=${clienteId} log=${log.id}`);
    return out({ ok: true, log_id: log.id });
  } catch (e) {
    console.error("enviar-boasvindas excecao", String(e));
    return out({ ok: false, error: String(e) }, 500);
  }
});
