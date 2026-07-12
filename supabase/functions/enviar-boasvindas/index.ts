// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: enviar-boasvindas
// E-mails transacionais de pagamento via Zoho Mail API:
//   tipo "boas_vindas" (padrão)  → BV + código de ativação (1× na vida)
//   tipo "renovacao"             → REN, confirmação de renovação
//   tipo "reembolso"             → reembolso confirmado (garantia)
//   tipo "cancelamento"          → cancelamento confirmado
//   tipo "cobranca_falhou"       → aviso D0: 3 dias de carência
//   tipo "acesso_pausado"        → carência venceu, acesso pausado
//   tipo "chargeback"            → SÓ alerta interno pra suporte@ (nunca cliente)
// Idempotência por pagamento: ref = payment id do Asaas (ref_externa no log);
// sem ref, janela de 20h por tipo. Remetente ao cliente: "Notinha
// <contato@usenotinha.com.br>". Falha de envio → INSERT em email_falhas +
// alerta interno pra suporte@ (remetente "Notinha Alertas"). Rastreio: pixel.
// Auth: header x-webhook-token = WEBHOOK_TOKEN.
// ═════════════════════════════════════════════════════════════════

import {
  TPL_REN, TPL_REEMBOLSO, TPL_CANCELAMENTO, TPL_COBRANCA, TPL_PAUSADO, TPL_ALERTA_CHARGEBACK,
} from "./templates.ts";

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

const EMAIL_ENVIO      = "contato@usenotinha.com.br";
const REMETENTE        = `Notinha <${EMAIL_ENVIO}>`;          // nome exibido na caixa de entrada
const REMETENTE_ALERTA = `Notinha Alertas <${EMAIL_ENVIO}>`;  // só e-mail interno
const SUPORTE_EMAIL    = "suporte@usenotinha.com.br";
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

// Merge de placeholders {chave} → valor (templates em runtime, nada hardcode)
function merge(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([a-z_]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
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

// Falha de entrega: grava/incrementa em email_falhas + alerta interno pra suporte@.
// Nunca lança — falha do alerta só vira log.
async function registrarFalha(c: any, tipoEmail: string, motivo: string) {
  try {
    const rq = await fetch(
      `${SUPABASE_URL}/rest/v1/email_falhas?cliente_id=eq.${c.id}&tipo_email=eq.${tipoEmail}&resolvido=eq.false&select=id,tentativas&limit=1`,
      { headers: sb() },
    );
    const aberta = (await rq.json())?.[0];
    if (aberta) {
      await fetch(`${SUPABASE_URL}/rest/v1/email_falhas?id=eq.${aberta.id}`, {
        method: "PATCH", headers: sb(),
        body: JSON.stringify({ tentativas: (aberta.tentativas ?? 1) + 1, motivo }),
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/email_falhas`, {
        method: "POST", headers: sb(),
        body: JSON.stringify({ cliente_id: c.id, email: c.email, tipo_email: tipoEmail, motivo }),
      });
    }
    const html = merge(TPL_ALERTA_FALHA, {
      primeiro_nome: (c.nome ?? "—").split(" ")[0],
      email_cliente: c.email ?? "—",
      whatsapp_cliente: c.telefone ?? "—",
      motivo_falha: motivo.slice(0, 300),
      codigo: c.codigo_ativacao ?? "—",
    });
    const al = await zohoEnviar(SUPORTE_EMAIL, `[AÇÃO] Falha de entrega — ${tipoEmail}`, html, REMETENTE_ALERTA);
    if (!al.ok) console.error("alerta falha_entrega nao enviado", JSON.stringify(al.resp));
  } catch (e) {
    console.error("registrarFalha excecao", String(e));
  }
}

// ── Template BV (design do site: tema escuro, Fraunces + DM Sans) ──
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
    P(`Oi, ${nome}! Seu pagamento foi confirmado e sua assinatura do Notinha já está ativa.`) +
    P(`Agora são só ${B("2 passos")} pra tudo começar a funcionar:`) +
    P(`${B("1. Cria sua senha de acesso.")} É no botão “Primeiro acesso” da sua página de conta — leva 1 minuto:`) +
    BTN("Criar minha senha →", CONTA, BRAND) +
    P(`${B("2. Ativa o Notinha no WhatsApp.")} Clica no botão abaixo — ele abre o WhatsApp com a mensagem de ativação já escrita. É só apertar enviar:`) +
    BTN("Ativar no WhatsApp →", waUrl, WAG) +
    P("Se o botão não abrir, manda esta mensagem no nosso WhatsApp:", MUTED) +
    `<tr><td style="padding:0 32px 20px 32px;" align="center"><span style="display:inline-block;background:${BG};border:1px dashed ${BRAND};border-radius:8px;padding:14px 28px;font-family:'Courier New',Courier,monospace;font-size:18px;letter-spacing:1px;color:${TEXT};">ATIVAR ${codigo}</span></td></tr>` +
    P("Assim que ativar, seu assistente acorda e cria sua planilha no Google Drive.") +
    P(`Qualquer dúvida de uso, o guia completo está na sua conta, seção ${B("Como Usar")}: <a href="${CONTA}" style="color:${BRANDH};text-decoration:underline;">usenotinha.com.br/conta</a>`);

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>Pagamento confirmado</title></head>
<body style="margin:0;padding:0;background-color:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Dois passos e seu Notinha entra em ação.</div>
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

// ── Template ALERTA interno: falha de entrega (só pra suporte@) ──
// Placeholders: {primeiro_nome}, {email_cliente}, {whatsapp_cliente}, {motivo_falha}, {codigo}
const TPL_ALERTA_FALHA = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>[AÇÃO] Cliente pagou e não recebeu boas-vindas</title></head>
<body style="margin:0;padding:0;background-color:#f2f4f4;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Alerta interno — falha de entrega.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f2f4f4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background-color:#288A89;padding:28px 32px;text-align:center;">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:bold;color:#ffffff;">Notinha</span><br>
<span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#d8ecec;">Suas notas organizadas no WhatsApp</span>
</td></tr>
<tr><td style="padding:36px 32px 8px 32px;">
<h1 style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#1a2b2b;">⚠️ Falha de entrega — cliente pagou</h1>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;">Alerta automático: o e-mail transacional NÃO foi entregue.</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Cliente:</strong> {primeiro_nome} — {email_cliente} — {whatsapp_cliente}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Motivo:</strong> {motivo_falha}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Código de ativação:</strong> {codigo}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#334848;"><strong style="color:#1a2b2b;">Ação:</strong> contatar o cliente pelo WhatsApp em até 24h e enviar o código manualmente. Registrar contato na tabela email_falhas (marcar resolvido).</p>
</td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e6ecec;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8aa0a0;">
Notinha · usenotinha.com.br · alerta interno automático.</p>
</td></tr></table></td></tr></table></body></html>`;

// Assunto + template dos tipos de ciclo de pagamento (BV e REN têm caminho próprio)
const EMAILS_CICLO: Record<string, { assunto: string; tpl: string }> = {
  reembolso:       { assunto: "Reembolso confirmado ✅",       tpl: TPL_REEMBOLSO },
  cancelamento:    { assunto: "Cancelamento confirmado",       tpl: TPL_CANCELAMENTO },
  cobranca_falhou: { assunto: "Seu pagamento não caiu 😬",     tpl: TPL_COBRANCA },
  acesso_pausado:  { assunto: "Seu Notinha foi pausado ⏸️",    tpl: TPL_PAUSADO },
};
const TIPOS_VALIDOS = new Set([
  "boas_vindas", "renovacao", "chargeback", ...Object.keys(EMAILS_CICLO),
]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  if (req.headers.get("x-webhook-token") !== WEBHOOK_TOKEN) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad_json", { status: 400 }); }
  const clienteId = body?.cliente_id;
  if (!clienteId) return new Response("cliente_id_obrigatorio", { status: 400 });
  const tipo = TIPOS_VALIDOS.has(body?.tipo) ? body.tipo : "boas_vindas";
  const ref  = body?.ref ? String(body.ref) : null;

  const out = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

  let c: any = null;
  try {
    // 1. Cliente
    const rc = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}&select=id,nome,email,telefone,codigo_ativacao,pagamento_status,email_boasvindas_enviado`,
      { headers: sb() },
    );
    c = (await rc.json())?.[0];
    if (!c) return out({ ok: false, motivo: "cliente_nao_encontrado" });

    // Chargeback: NUNCA e-mail ao cliente — só alerta interno pra suporte@
    if (tipo === "chargeback") {
      const dup = ref
        ? `ref_externa=eq.${ref}`
        : `enviado_em=gte.${new Date(Date.now() - 20 * 3600 * 1000).toISOString()}`;
      const rj = await fetch(
        `${SUPABASE_URL}/rest/v1/emails_log?cliente_id=eq.${clienteId}&tipo=eq.chargeback&status=eq.enviado&${dup}&select=id&limit=1`,
        { headers: sb() },
      );
      if (((await rj.json()) ?? []).length > 0) return out({ ok: true, ja_enviado: true });
      const html = merge(TPL_ALERTA_CHARGEBACK, {
        primeiro_nome: (c.nome ?? "—").split(" ")[0],
        email_cliente: c.email ?? "—",
        whatsapp_cliente: c.telefone ?? "—",
        ref_pagamento: ref ?? "—",
      });
      const envio = await zohoEnviar(
        SUPORTE_EMAIL, `[URGENTE] Chargeback — ${c.nome ?? clienteId}`, html, REMETENTE_ALERTA,
      );
      await fetch(`${SUPABASE_URL}/rest/v1/emails_log`, {
        method: "POST", headers: sb(),
        body: JSON.stringify({
          cliente_id: clienteId, tipo: "chargeback", email_para: SUPORTE_EMAIL, ref_externa: ref,
          status: envio.ok ? "enviado" : "falhou",
          erro: envio.ok ? null : JSON.stringify(envio.resp).slice(0, 500),
        }),
      });
      return out({ ok: envio.ok });
    }

    if (!c.email) {
      // pagou e não tem como receber → falha registrada + alerta interno
      await registrarFalha(c, tipo, "cliente sem e-mail cadastrado");
      return out({ ok: false, motivo: "sem_email" });
    }
    if (tipo === "boas_vindas" && !c.codigo_ativacao) {
      await registrarFalha(c, tipo, "cliente sem codigo_ativacao (garantirCodigo falhou?)");
      return out({ ok: false, motivo: "sem_codigo" });
    }

    // 2. Idempotência
    if (tipo === "boas_vindas") {
      if (c.email_boasvindas_enviado) return out({ ok: true, ja_enviado: true });
      const rj = await fetch(
        `${SUPABASE_URL}/rest/v1/emails_log?cliente_id=eq.${clienteId}&tipo=eq.boas_vindas&status=eq.enviado&select=id&limit=1`,
        { headers: sb() },
      );
      if (((await rj.json()) ?? []).length > 0) return out({ ok: true, ja_enviado: true });
    } else {
      // Demais tipos: 1 por pagamento (ref = payment id do Asaas; eventos
      // duplicados como CONFIRMED + RECEIVED não geram 2 e-mails).
      // Sem ref, janela de 20h por tipo.
      const dup = ref
        ? `ref_externa=eq.${ref}`
        : `enviado_em=gte.${new Date(Date.now() - 20 * 3600 * 1000).toISOString()}`;
      const rj = await fetch(
        `${SUPABASE_URL}/rest/v1/emails_log?cliente_id=eq.${clienteId}&tipo=eq.${tipo}&status=eq.enviado&${dup}&select=id&limit=1`,
        { headers: sb() },
      );
      if (((await rj.json()) ?? []).length > 0) return out({ ok: true, ja_enviado: true });
    }

    // 3. Cria o registro do log (id vira o rastreador do pixel)
    const ri = await fetch(`${SUPABASE_URL}/rest/v1/emails_log`, {
      method: "POST",
      headers: sb({ Prefer: "return=representation" }),
      body: JSON.stringify({ cliente_id: clienteId, tipo, email_para: c.email, ref_externa: ref }),
    });
    const log = (await ri.json())?.[0];
    if (!log?.id) return out({ ok: false, motivo: "falha_log" }, 500);

    // 4. Monta e envia
    const nome = (c.nome ?? "").split(" ")[0] || "tudo bem";
    const pixelUrl = `${SUPABASE_URL}/functions/v1/pixel?id=${log.id}`;
    let assunto: string;
    let html: string;
    if (tipo === "boas_vindas") {
      assunto = "Pagamento confirmado — bora ativar 🎉";
      html = htmlEmail(nome, c.codigo_ativacao, log.id);
    } else if (tipo === "renovacao") {
      assunto = "Renovação confirmada 🧾";
      html = merge(TPL_REN, { primeiro_nome: nome, pixel_url: pixelUrl });
    } else {
      const cfg = EMAILS_CICLO[tipo];
      assunto = cfg.assunto;
      html = merge(cfg.tpl, { primeiro_nome: nome, pixel_url: pixelUrl, link_fatura: CONTA });
    }
    const envio = await zohoEnviar(c.email, assunto, html);

    // 5. Atualiza o log (+ flag do cliente no BV)
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
      await registrarFalha(c, tipo, "zoho: " + JSON.stringify(envio.resp).slice(0, 300));
      return out({ ok: false, zoho: envio.resp });
    }
    if (tipo === "boas_vindas") {
      await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}`, {
        method: "PATCH", headers: sb(),
        body: JSON.stringify({ email_boasvindas_enviado: true }),
      });
    }
    console.log(`${tipo} enviado cliente=${clienteId} log=${log.id}`);
    return out({ ok: true, log_id: log.id });
  } catch (e) {
    console.error("enviar-boasvindas excecao", String(e));
    if (c?.id) await registrarFalha(c, tipo, "excecao: " + String(e).slice(0, 300));
    return out({ ok: false, error: String(e) }, 500);
  }
});
