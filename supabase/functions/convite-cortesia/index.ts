// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: convite-cortesia
// Fluxo exclusivo de acesso cortesia (influencers/parceiras).
//   POST { nome, email, telefone, plano_tier?, meses?, reenviar? }
//   1. cria cliente com pagamento_status="cortesia"
//   2. gera codigo_ativacao único
//   3. monta a URL de OAuth do Google Drive (state opaco em oauth_states)
//   4. dispara e-mail de convite via Zoho Mail API (design do site)
//   5. devolve cliente_id + codigo + oauth_url (mesmo se o e-mail falhar)
// Auth: header x-webhook-token = WEBHOOK_TOKEN (secret) OU CRON_TOKEN
//       (tabela config_privada) — a 2ª chave permite disparo via SQL/pg_net.
// Rastreio: pixel de abertura + clique no botão do WhatsApp (/pixel?r=wa).
// A validade da cortesia (meses, default 6) aparece SO no texto do e-mail:
// nao existe corte automatico no banco. Encerramento e manual.
// Config: Verify JWT = OFF.
// ═════════════════════════════════════════════════════════════════

const WEBHOOK_TOKEN      = Deno.env.get("WEBHOOK_TOKEN")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID   = Deno.env.get("GOOGLE_CLIENT_ID")!;
const ZOHO_CLIENT_ID     = Deno.env.get("ZOHO_CLIENT_ID")!;
const ZOHO_CLIENT_SECRET = Deno.env.get("ZOHO_CLIENT_SECRET")!;
const ZOHO_ACCOUNTS_URL  = Deno.env.get("ZOHO_ACCOUNTS_URL") ?? "https://accounts.zoho.com";
const ZOHO_MAIL_API      = "https://mail.zoho.com";

const EMAIL_ENVIO = "contato@usenotinha.com.br";
const REMETENTE   = `Notinha <${EMAIL_ENVIO}>`;
const CONTA       = "https://usenotinha.com.br/conta";
const SUPORTE     = "https://usenotinha.com.br/contato";

const OAUTH_REDIRECT = "https://xpzjwlhrlebdpcybxaxu.supabase.co/functions/v1/oauth-callback";
const SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

// Alfabeto sem caracteres ambíguos (0/O, 1/I) — código é ditado por WhatsApp
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function sb(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Autorização: WEBHOOK_TOKEN (secret) ou CRON_TOKEN (config_privada) ──
// A 2ª chave existe para permitir disparo por SQL/pg_net, sem precisar ler
// secrets de Edge Function.
async function autorizado(req: Request): Promise<boolean> {
  const t = req.headers.get("x-webhook-token") ?? "";
  if (!t) return false;
  if (t === WEBHOOK_TOKEN) return true;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/config_privada?k=eq.CRON_TOKEN&select=v`,
      { headers: sb() },
    );
    const v = (await r.json())?.[0]?.v;
    return !!v && t === v;
  } catch (e) {
    console.error("autorizado", String(e));
    return false;
  }
}

// ── Código de ativação único (6 chars, colisão verificada no banco) ──
function sortearCodigo(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (n) => ALFABETO[n % ALFABETO.length]).join("");
}

async function gerarCodigoUnico(): Promise<string | null> {
  for (let i = 0; i < 6; i++) {
    const c = sortearCodigo();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?codigo_ativacao=eq.${c}&select=id&limit=1`,
      { headers: sb() },
    );
    if (((await r.json()) ?? []).length === 0) return c;
  }
  return null;
}

// ── State opaco do OAuth: uso único, 30 min, resolvido pelo oauth-callback ──
async function sha256hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
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
    method: "POST", headers: sb(),
    body: JSON.stringify({ state_hash: await sha256hex(t), cliente_id: clienteId, expira_em: expira }),
  });
  if (!r.ok) {
    console.error("oauth_states insert", await r.text());
    return null;
  }
  return t;
}

// ── Zoho Mail ──
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
  const p = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: await zohoRefreshToken(),
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
  if (!alvo?.accountId) throw new Error("zoho accountId não encontrado");
  cachedAccountId = String(alvo.accountId);
  return cachedAccountId;
}

async function zohoEnviar(para: string, assunto: string, html: string): Promise<{ ok: boolean; resp: any }> {
  try {
    const token = await zohoToken();
    const accountId = await zohoAccountId(token);
    const rz = await fetch(`${ZOHO_MAIL_API}/api/accounts/${accountId}/messages`, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAddress: REMETENTE,
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

// ── Template do e-mail (mesmo design do transacional atual) ──
function htmlConvite(nome: string, codigo: string, oauthUrl: string, logId: string, meses: number, validade: string): string {
  const BG = "#f4f6f6", SURFACE = "#ffffff", BORDER = "#e3e9e9";
  const TEXT = "#14302f", MUTED = "#6b7d7d", BODYC = "#3a4a4a", FOOT = "#8aa0a0";
  const BRAND = "#288A89", LINK = "#22706f", WAG = "#25D366";
  const CODEBG = "#f0f5f5";
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
    P(`Oi, ${nome}! Seu acesso ao ${B("Notinha Premium")} está liberado — ${B(`${meses} meses por nossa conta`)}, sem cobrança e sem cartão. 🎉`) +
    P(`São ${B("2 passos")} — leva menos de 2 minutos:`) +
    P(`${B("1. Autoriza o Google Drive.")} É onde sua planilha vai ficar. Ela nasce na sua conta e continua sua, sempre:`) +
    BTN("Conectar meu Google Drive →", oauthUrl, BRAND) +
    P(`${B("2. Ativa no WhatsApp.")} O botão abre a conversa com a mensagem de ativação já escrita. É só apertar enviar:`) +
    BTN("Ativar no WhatsApp →", waUrl, WAG) +
    P("Se o botão não abrir, manda esta mensagem no nosso WhatsApp:", MUTED) +
    `<tr><td style="padding:0 32px 20px 32px;" align="center"><span style="display:inline-block;background:${CODEBG};border:1px dashed ${BRAND};border-radius:8px;padding:14px 28px;font-family:'Courier New',Courier,monospace;font-size:18px;letter-spacing:1px;color:${TEXT};">ATIVAR ${codigo}</span></td></tr>` +
    P("Feito isso, é só mandar a foto da nota. O resto ele faz.") +
    P(`Quer ver tudo que dá pra fazer? O guia completo fica na sua conta, seção ${B("Como Usar")}: <a href="${CONTA}" style="color:${LINK};text-decoration:underline;">usenotinha.com.br/conta</a> — o acesso é pelo botão “Primeiro acesso”, com este mesmo e-mail.`) +
    P(`Seus ${meses} meses de cortesia valem até ${B(validade)}. Perto do fim a gente te avisa — sem cobrança automática, sem surpresa.`, MUTED) +
    P("Ao ativar, você aceita os Termos de Uso e a Política de Privacidade do Notinha.", MUTED);

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seu acesso está liberado</title></head>
<body style="margin:0;padding:0;background-color:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Dois passos e seu Notinha entra em ação.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${SURFACE};border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
<tr><td style="background-color:${BRAND};padding:28px 32px;" align="center">
<span style="font-family:${FH};font-size:28px;font-weight:800;color:#ffffff;">Notinha</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;">
<h1 style="margin:0 0 8px 0;font-family:${FH};font-size:26px;line-height:1.25;font-weight:800;color:${TEXT};">Seu acesso está liberado 🎉</h1></td></tr>
${corpo}
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid ${BORDER};">
<p style="margin:0;font-family:${FB};font-size:12px;line-height:1.6;color:${FOOT};">
Notinha · CNPJ 66.824.150/0001-28 · Santos/SP<br>
Você recebeu este e-mail porque recebeu um acesso cortesia do Notinha.<br>
Precisa de ajuda? <a href="${SUPORTE}" style="color:${LINK};text-decoration:underline;">Fale com o suporte</a>.</p>
</td></tr></table>
<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;">
</td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  if (!(await autorizado(req))) {
    return new Response("unauthorized", { status: 401 });
  }

  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, erro: "json_invalido" }, 400); }

  const nome  = String(b.nome ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  let   tel   = String(b.telefone ?? "").replace(/\D/g, "");
  const tier  = b.plano_tier === "base" ? "base" : "premium";
  const reenviar = !!b.reenviar;
  const meses = Number.isFinite(Number(b.meses)) && Number(b.meses) > 0 ? Math.floor(Number(b.meses)) : 6;

  if (!nome || !email || !tel) return json({ ok: false, erro: "campos_obrigatorios" }, 400);
  if (!tel.startsWith("55")) tel = "55" + tel;
  if (tel.length < 12 || tel.length > 13) return json({ ok: false, erro: "telefone_invalido", tel }, 400);

  try {
    // 1. Cliente já existe? (telefone é UNIQUE)
    const rEx = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?telefone=eq.${tel}&select=id,nome,email,codigo_ativacao,pagamento_status&limit=1`,
      { headers: sb() },
    );
    let cli = (await rEx.json())?.[0] ?? null;

    if (cli && !reenviar) {
      return json({ ok: false, erro: "cliente_ja_existe", cliente_id: cli.id, dica: "use reenviar:true" }, 409);
    }

    // 2. Cria (ou promove a cortesia, no reenvio)
    if (!cli) {
      const codigo = await gerarCodigoUnico();
      if (!codigo) return json({ ok: false, erro: "falha_gerar_codigo" }, 500);

      const rIns = await fetch(`${SUPABASE_URL}/rest/v1/clientes`, {
        method: "POST",
        headers: sb({ Prefer: "return=representation" }),
        body: JSON.stringify({
          nome, email, telefone: tel,
          plano: "ativo",
          plano_tier: tier,
          pagamento_status: "cortesia",
          codigo_ativacao: codigo,
          codigo_gerado_em: new Date().toISOString(),
          aceitou_termos: true,
          data_aceite: new Date().toISOString(),
          versao_termos_aceitos: "1.0",
          pais: "BR",
        }),
      });
      if (!rIns.ok) {
        console.error("insert cliente", await rIns.text());
        return json({ ok: false, erro: "falha_criar_cliente" }, 500);
      }
      cli = (await rIns.json())?.[0];
    } else {
      const patch: Record<string, unknown> = {
        nome, email, plano_tier: tier, pagamento_status: "cortesia",
      };
      if (!cli.codigo_ativacao) {
        const codigo = await gerarCodigoUnico();
        if (!codigo) return json({ ok: false, erro: "falha_gerar_codigo" }, 500);
        patch.codigo_ativacao = codigo;
        patch.codigo_gerado_em = new Date().toISOString();
        cli.codigo_ativacao = codigo;
      }
      await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${cli.id}`, {
        method: "PATCH", headers: sb(), body: JSON.stringify(patch),
      });
    }

    // 3. URL de conexão do Drive (state opaco, nunca o cliente_id cru)
    const stateToken = await criarState(cli.id, 24 * 7);  // convite vai por e-mail
    if (!stateToken) return json({ ok: false, erro: "falha_state", cliente_id: cli.id }, 500);

    const oauthUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state: stateToken,
    }).toString();

    // 4. Log do e-mail (o id vira o rastreador do pixel e do botão do WhatsApp)
    const rLog = await fetch(`${SUPABASE_URL}/rest/v1/emails_log`, {
      method: "POST",
      headers: sb({ Prefer: "return=representation" }),
      body: JSON.stringify({
        cliente_id: cli.id, tipo: "convite_cortesia", email_para: email,
        ref_externa: `cortesia:${cli.id}`,
      }),
    });
    const log = (await rLog.json())?.[0];
    if (!log?.id) return json({ ok: false, erro: "falha_log", cliente_id: cli.id, oauth_url: oauthUrl }, 500);

    // 5. Envia
    const primeiro = nome.split(" ")[0];
    const fim = new Date();
    fim.setMonth(fim.getMonth() + meses);
    const validade = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
    }).format(fim);
    const html = htmlConvite(primeiro, cli.codigo_ativacao, oauthUrl, log.id, meses, validade);
    const envio = await zohoEnviar(email, "Seu acesso ao Notinha está liberado 🎉", html);

    await fetch(`${SUPABASE_URL}/rest/v1/emails_log?id=eq.${log.id}`, {
      method: "PATCH", headers: sb(),
      body: JSON.stringify(
        envio.ok ? { status: "enviado" }
                 : { status: "falhou", erro: JSON.stringify(envio.resp).slice(0, 500) },
      ),
    });

    // Links sempre devolvidos — dá pra mandar manual se o e-mail falhar
    return json({
      ok: envio.ok,
      cliente_id: cli.id,
      codigo: cli.codigo_ativacao,
      plano_tier: tier,
      meses_cortesia: meses,
      cortesia_ate: validade,
      oauth_url: oauthUrl,
      wa_url: `https://wa.me/5513996286090?text=${encodeURIComponent("ATIVAR " + cli.codigo_ativacao)}`,
      email_status: envio.ok ? "enviado" : "falhou",
      zoho: envio.ok ? undefined : envio.resp,
      log_id: log.id,
    });
  } catch (e) {
    console.error("convite-cortesia excecao", String(e));
    return json({ ok: false, erro: String(e) }, 500);
  }
});
