// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: emails-recuperacao
// Cron diário (pg_cron 12h UTC / 9h BRT) de recuperação de onboarding.
// Checa o estado do cliente NA HORA do envio — nunca agenda cego:
//   R1: pagou há ≥1 dia, ativado=false, nenhum R1 enviado
//   R2: pagou há ≥3 dias, ativado=false, R1 enviado, R2 não
//   R3: ativado=true, drive_folder_id IS NULL há ≥1 dia, R3 não enviado
//   ALERTA-d7: pagou há ≥7 dias, ativado=false → interno pra suporte@
//              (NUNCA e-mail ao cliente)
// Máx. 1 e-mail de recuperação/dia por cliente (ultimo_email_recuperacao).
// Registro de envios: emails_log (tipos r1/r2/r3/alerta_d7) — tabela já
// existente com pixel de abertura, histórico e dedupe por status=enviado.
// Retry de email_falhas: reprocessa não-resolvidos (backoff natural de
// 24h entre tentativas via cron diário); ≥3 tentativas → alerta suporte@.
// Inadimplência: cliente com inadimplente_desde ≥3 dias (carência do aviso
// D0 do webhook) → pagamento_status=bloqueado + e-mail "acesso pausado".
// Durante a carência, nenhum R1/R2/R3 é enviado (um problema por vez).
// "Pagou" = data do BV enviado (emails_log); fallback criado_em.
// Auth: header x-cron-token = config_privada.CRON_TOKEN (ou secret CRON_TOKEN).
// Remetente cliente: "Notinha" · alertas internos: "Notinha Alertas".
// Secrets usados: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WEBHOOK_TOKEN,
// ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET (+ opcionais CRON_TOKEN,
// WHATSAPP_NUMBER, OAUTH_DRIVE_URL — senão vêm da config_privada).
// ═════════════════════════════════════════════════════════════════

import { merge, TPL_R1, TPL_R2, TPL_R3, TPL_ALERTA_D7, TPL_ALERTA_FALHA } from "./templates.ts";

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_TOKEN      = Deno.env.get("WEBHOOK_TOKEN")!;   // p/ reenvio via enviar-boasvindas
const ZOHO_CLIENT_ID     = Deno.env.get("ZOHO_CLIENT_ID")!;
const ZOHO_CLIENT_SECRET = Deno.env.get("ZOHO_CLIENT_SECRET")!;
const ZOHO_ACCOUNTS_URL  = Deno.env.get("ZOHO_ACCOUNTS_URL") ?? "https://accounts.zoho.com";
const ZOHO_MAIL_API      = "https://mail.zoho.com";

const EMAIL_ENVIO      = "contato@usenotinha.com.br";
const REMETENTE        = `Notinha <${EMAIL_ENVIO}>`;          // e-mail ao cliente
const REMETENTE_ALERTA = `Notinha Alertas <${EMAIL_ENVIO}>`;  // só interno
const SUPORTE_EMAIL    = "suporte@usenotinha.com.br";
const CONTA_URL        = "https://usenotinha.com.br/conta";

// OAuth do Drive: mesma montagem da função onboarding (state = cliente_id)
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const OAUTH_REDIRECT   = `${SUPABASE_URL}/functions/v1/oauth-callback`;
const OAUTH_SCOPE      = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

// Link de conexão do Drive é POR CLIENTE (state identifica quem conectou).
// Override manual: config_privada.OAUTH_DRIVE_URL ≠ "PENDENTE" vale pra todos.
// Sem GOOGLE_CLIENT_ID e sem override, cai na página da conta.
function linkOauthDrive(clienteId: string, override: string): string {
  if (override && override !== "PENDENTE") return override;
  if (!GOOGLE_CLIENT_ID) return CONTA_URL;
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: OAUTH_REDIRECT, response_type: "code",
    scope: OAUTH_SCOPE, access_type: "offline", prompt: "consent", state: clienteId,
  }).toString();
}

const DIA = 24 * 3600 * 1000;

function sb(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// ── config_privada: valores de runtime (secret tem precedência) ──
const cacheConfig = new Map<string, string>();
async function configVal(k: string): Promise<string | null> {
  const env = Deno.env.get(k);
  if (env) return env;
  if (cacheConfig.has(k)) return cacheConfig.get(k)!;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/config_privada?k=eq.${k}&select=v`, { headers: sb() });
  const v = (await r.json())?.[0]?.v ?? null;
  if (v) cacheConfig.set(k, v);
  return v;
}

// ── Zoho Mail API (mesmo mecanismo da enviar-boasvindas) ──
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

// Envio genérico. Devolve { ok, resp } — nunca lança.
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

// Falha de entrega: grava/incrementa em email_falhas. Nunca lança.
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
  } catch (e) {
    console.error("registrarFalha excecao", String(e));
  }
}

// Envia R1/R2/R3: cria log (pixel), envia, atualiza log + cap diário do cliente.
async function enviarRecuperacao(
  c: any, tipo: string, assunto: string, html: string, resumo: Record<string, number>,
) {
  try {
    const ri = await fetch(`${SUPABASE_URL}/rest/v1/emails_log`, {
      method: "POST",
      headers: sb({ Prefer: "return=representation" }),
      body: JSON.stringify({ cliente_id: c.id, tipo, email_para: c.email }),
    });
    const log = (await ri.json())?.[0];
    if (!log?.id) { resumo.falhas++; return; }

    const htmlFinal = merge(html, { pixel_url: `${SUPABASE_URL}/functions/v1/pixel?id=${log.id}` });
    const envio = await zohoEnviar(c.email, assunto, htmlFinal);

    await fetch(`${SUPABASE_URL}/rest/v1/emails_log?id=eq.${log.id}`, {
      method: "PATCH", headers: sb(),
      body: JSON.stringify(
        envio.ok ? { status: "enviado" }
                 : { status: "falhou", erro: JSON.stringify(envio.resp).slice(0, 500) },
      ),
    });

    if (envio.ok) {
      // cap: máx. 1 e-mail de recuperação/dia — só conta envio com sucesso
      await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${c.id}`, {
        method: "PATCH", headers: sb(),
        body: JSON.stringify({ ultimo_email_recuperacao: new Date().toISOString() }),
      });
      resumo[tipo] = (resumo[tipo] ?? 0) + 1;
      console.log(`${tipo} enviado cliente=${c.id} log=${log.id}`);
    } else {
      resumo.falhas++;
      console.error(`${tipo} falhou cliente=${c.id}`, JSON.stringify(envio.resp));
      await registrarFalha(c, tipo, "zoho: " + JSON.stringify(envio.resp).slice(0, 300));
    }
  } catch (e) {
    resumo.falhas++;
    console.error("enviarRecuperacao excecao", String(e));
  }
}

// ALERTA D+7 (interno, nunca ao cliente; não conta no cap diário do cliente)
async function alertaD7(c: any, resumo: Record<string, number>) {
  try {
    const html = merge(TPL_ALERTA_D7, {
      primeiro_nome: (c.nome ?? "—").split(" ")[0],
      email_cliente: c.email ?? "—",
      whatsapp_cliente: c.telefone ?? "—",
      codigo: c.codigo_ativacao ?? "—",
      senha_criada: c.senha_criada ? "sim" : "não",
      drive_status: c.drive_folder_id ? "conectado" : "não conectado",
    });
    const envio = await zohoEnviar(
      SUPORTE_EMAIL, `[AÇÃO] D+7 sem ativação — ${c.nome ?? c.id}`, html, REMETENTE_ALERTA,
    );
    // registra no emails_log pra nunca repetir o alerta do mesmo cliente
    await fetch(`${SUPABASE_URL}/rest/v1/emails_log`, {
      method: "POST", headers: sb(),
      body: JSON.stringify({
        cliente_id: c.id, tipo: "alerta_d7", email_para: SUPORTE_EMAIL,
        status: envio.ok ? "enviado" : "falhou",
        erro: envio.ok ? null : JSON.stringify(envio.resp).slice(0, 500),
      }),
    });
    if (envio.ok) resumo.alerta_d7++;
    else { resumo.falhas++; console.error("alerta_d7 falhou", JSON.stringify(envio.resp)); }
  } catch (e) {
    resumo.falhas++;
    console.error("alertaD7 excecao", String(e));
  }
}

// Carência vencida: inadimplente há ≥3 dias e ainda ativo → pausa o acesso
// (pagamento_status=bloqueado) + e-mail "acesso pausado". A reativação é
// automática: PAYMENT_CONFIRMED no webhook volta pra ativo e zera a marca.
async function processarInadimplentes(resumo: Record<string, number>) {
  const rc = await fetch(
    `${SUPABASE_URL}/rest/v1/clientes?pagamento_status=eq.ativo&anonimizado=eq.false&inadimplente_desde=not.is.null&select=id,nome,email,inadimplente_desde`,
    { headers: sb() },
  );
  const rows = (await rc.json()) ?? [];
  for (const c of rows) {
    try {
      if (Date.now() - Date.parse(c.inadimplente_desde) < 3 * DIA) continue; // ainda na carência
      await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${c.id}&pagamento_status=eq.ativo`, {
        method: "PATCH", headers: sb(),
        body: JSON.stringify({ pagamento_status: "bloqueado" }),
      });
      const r = await fetch(`${SUPABASE_URL}/functions/v1/enviar-boasvindas`, {
        method: "POST",
        headers: { "x-webhook-token": WEBHOOK_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: c.id, tipo: "acesso_pausado" }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) resumo.pausados++;
      else { resumo.falhas++; console.error("acesso_pausado falhou", c.id, JSON.stringify(j)); }
      console.log(`inadimplencia vencida: cliente=${c.id} pausado`);
    } catch (e) {
      resumo.falhas++;
      console.error("processarInadimplentes excecao", c.id, String(e));
    }
  }
}

// Tipos que o retry reenvia via enviar-boasvindas (todos idempotentes lá)
const TIPOS_REENVIO = new Set([
  "boas_vindas", "renovacao", "reembolso", "cancelamento", "cobranca_falhou", "acesso_pausado",
]);

// Retry de email_falhas não-resolvidas. Backoff = 1 tentativa por rodada
// diária do cron. Na 3ª falha, alerta humano e para de tentar sozinho.
async function retryFalhas(resumo: Record<string, number>) {
  const rf = await fetch(
    `${SUPABASE_URL}/rest/v1/email_falhas?resolvido=eq.false&select=id,cliente_id,email,tipo_email,motivo,tentativas,alertado`,
    { headers: sb() },
  );
  const falhas = (await rf.json()) ?? [];
  for (const f of falhas) {
    try {
      if (f.tentativas >= 3) {
        if (!f.alertado) {
          // esgotou: humano assume — busca dados do cliente pro alerta
          const rc = await fetch(
            `${SUPABASE_URL}/rest/v1/clientes?id=eq.${f.cliente_id}&select=nome,email,telefone,codigo_ativacao`,
            { headers: sb() },
          );
          const c = (await rc.json())?.[0] ?? {};
          const html = merge(TPL_ALERTA_FALHA, {
            primeiro_nome: (c.nome ?? "—").split(" ")[0],
            email_cliente: c.email ?? f.email ?? "—",
            whatsapp_cliente: c.telefone ?? "—",
            motivo_falha: `${f.tipo_email}: ${(f.motivo ?? "").slice(0, 200)} — ${f.tentativas} tentativas`,
            codigo: c.codigo_ativacao ?? "—",
          });
          const envio = await zohoEnviar(
            SUPORTE_EMAIL, `[AÇÃO] Falha de entrega persistente — ${f.tipo_email}`, html, REMETENTE_ALERTA,
          );
          if (envio.ok) {
            await fetch(`${SUPABASE_URL}/rest/v1/email_falhas?id=eq.${f.id}`, {
              method: "PATCH", headers: sb(), body: JSON.stringify({ alertado: true }),
            });
          }
        }
        continue;
      }

      if (TIPOS_REENVIO.has(f.tipo_email)) {
        // reenvio via enviar-boasvindas (idempotente; em falha ela mesma
        // incrementa tentativas em email_falhas — não incrementar aqui)
        const r = await fetch(`${SUPABASE_URL}/functions/v1/enviar-boasvindas`, {
          method: "POST",
          headers: { "x-webhook-token": WEBHOOK_TOKEN, "Content-Type": "application/json" },
          body: JSON.stringify({ cliente_id: f.cliente_id, tipo: f.tipo_email }),
        });
        const j = await r.json().catch(() => ({}));
        if (j?.ok) {
          await fetch(`${SUPABASE_URL}/rest/v1/email_falhas?id=eq.${f.id}`, {
            method: "PATCH", headers: sb(), body: JSON.stringify({ resolvido: true }),
          });
          resumo.retries++;
        }
      } else {
        // r1/r2/r3: o loop diário reenvia sozinho (condição usa status=enviado);
        // aqui só marca resolvido quando o reenvio já aconteceu
        const rl = await fetch(
          `${SUPABASE_URL}/rest/v1/emails_log?cliente_id=eq.${f.cliente_id}&tipo=eq.${f.tipo_email}&status=eq.enviado&select=id&limit=1`,
          { headers: sb() },
        );
        if (((await rl.json()) ?? []).length > 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/email_falhas?id=eq.${f.id}`, {
            method: "PATCH", headers: sb(), body: JSON.stringify({ resolvido: true }),
          });
          resumo.retries++;
        }
      }
    } catch (e) {
      console.error("retryFalhas item excecao", f.id, String(e));
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const esperado = await configVal("CRON_TOKEN");
  if (!esperado || req.headers.get("x-cron-token") !== esperado) {
    return new Response("unauthorized", { status: 401 });
  }

  // Disparo manual de 1 e-mail transacional pra 1 cliente (fix pontual/teste),
  // sem rodar o ciclo: body {"bv_cliente_id":"uuid","tipo":"..."} — o tipo é
  // validado pela própria enviar-boasvindas (inválido/ausente vira BV, que é
  // idempotente).
  let bodyReq: any = null;
  try { bodyReq = await req.json(); } catch { /* corpo vazio = rodada normal */ }
  if (bodyReq?.bv_cliente_id) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/enviar-boasvindas`, {
      method: "POST",
      headers: { "x-webhook-token": WEBHOOK_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente_id: bodyReq.bv_cliente_id,
        tipo: typeof bodyReq.tipo === "string" ? bodyReq.tipo : "boas_vindas",
        ref: bodyReq.ref ?? null,
      }),
    });
    const j = await r.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: true, disparo_manual: j }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const resumo: Record<string, number> = { r1: 0, r2: 0, r3: 0, alerta_d7: 0, pausados: 0, retries: 0, falhas: 0 };
  const agora = Date.now();

  try {
    // carência de inadimplência vencida → pausa ANTES do ciclo de recuperação
    await processarInadimplentes(resumo);

    // placeholders de runtime
    const numeroWa = (await configVal("WHATSAPP_NUMBER")) ?? "5513996286090";
    const oauthOverride = (await configVal("OAUTH_DRIVE_URL")) ?? "PENDENTE";

    // clientes pagantes ativos (cortesia/bloqueado/anonimizado ficam fora)
    const rc = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?pagamento_status=eq.ativo&anonimizado=eq.false&email=not.is.null&select=id,nome,email,telefone,codigo_ativacao,ativado,ativado_em,drive_folder_id,senha_criada,ultimo_email_recuperacao,criado_em,inadimplente_desde`,
      { headers: sb() },
    );
    const clientes = (await rc.json()) ?? [];

    // histórico de envios (1 fetch; agrupado em memória)
    const rl = await fetch(
      `${SUPABASE_URL}/rest/v1/emails_log?status=eq.enviado&tipo=in.(boas_vindas,r1,r2,r3,alerta_d7)&select=cliente_id,tipo,enviado_em`,
      { headers: sb() },
    );
    const logs = (await rl.json()) ?? [];
    const hist = new Map<string, { tipos: Set<string>; bvEm: string | null }>();
    for (const l of logs) {
      const h = hist.get(l.cliente_id) ?? { tipos: new Set<string>(), bvEm: null };
      h.tipos.add(l.tipo);
      if (l.tipo === "boas_vindas") h.bvEm = l.enviado_em;
      hist.set(l.cliente_id, h);
    }

    for (const c of clientes) {
      const h = hist.get(c.id) ?? { tipos: new Set<string>(), bvEm: null };
      // "pagou" = quando o BV saiu; sem BV registrado, cai no criado_em
      const ancora = Date.parse(h.bvEm ?? c.criado_em);
      const diasPagou = (agora - ancora) / DIA;
      const nome = (c.nome ?? "").split(" ")[0] || "tudo bem";

      // D+7 sem ativação → alerta interno (1× por cliente, nunca ao cliente)
      if (!c.ativado && diasPagou >= 7 && !h.tipos.has("alerta_d7")) {
        await alertaD7(c, resumo);
      }

      // inadimplente na carência: pagamento primeiro, ativação depois —
      // nenhum R1/R2/R3 enquanto a cobrança está pendente
      if (c.inadimplente_desde) continue;

      // cap diário: máx. 1 e-mail de recuperação/dia por cliente
      if (c.ultimo_email_recuperacao && agora - Date.parse(c.ultimo_email_recuperacao) < DIA) continue;

      if (!c.ativado) {
        if (!c.codigo_ativacao) { console.error(`cliente ${c.id} sem codigo_ativacao — R1/R2 pulados`); continue; }
        const vars = { primeiro_nome: nome, codigo: c.codigo_ativacao, numero_whatsapp: numeroWa };
        if (diasPagou >= 1 && !h.tipos.has("r1")) {
          await enviarRecuperacao(c, "r1", "Falta 1 toque pra ativar 📲", merge(TPL_R1, vars), resumo);
        } else if (diasPagou >= 3 && h.tipos.has("r1") && !h.tipos.has("r2")) {
          await enviarRecuperacao(c, "r2", "Precisa de uma mão?", merge(TPL_R2, vars), resumo);
        }
      } else if (
        // R3 só depois de ativar: ativado há ≥1 dia e Drive ainda não conectado
        !c.drive_folder_id && c.ativado_em &&
        agora - Date.parse(c.ativado_em) >= DIA && !h.tipos.has("r3")
      ) {
        await enviarRecuperacao(
          c, "r3", "Só falta conectar teu Google Drive 📁",
          merge(TPL_R3, { primeiro_nome: nome, link_oauth_drive: linkOauthDrive(c.id, oauthOverride) }), resumo,
        );
      }
    }

    await retryFalhas(resumo);

    console.log("emails-recuperacao resumo", JSON.stringify(resumo));
    return new Response(JSON.stringify({ ok: true, ...resumo }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("emails-recuperacao excecao", String(e));
    return new Response(JSON.stringify({ ok: false, error: String(e), ...resumo }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
