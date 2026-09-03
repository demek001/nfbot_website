// ════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: oauth-callback
// Recebe o retorno do Google OAuth, troca o código por tokens,
// cria a pasta "Notinha" + planilha no Drive do cliente,
// salva refresh_token/folder_id/sheet_id no Supabase e
// mostra a tela de ativação no WhatsApp.
//
// IMPORTANTE: na config dessa função, deixe "Verify JWT" = OFF
// (o Google redireciona o navegador, sem JWT do Supabase).
// ════════════════════════════════════════════════════════════════

const GOOGLE_CLIENT_ID     = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GOOGLE_REDIRECT_URI  = Deno.env.get("GOOGLE_REDIRECT_URI")!;
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY         = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // injetado automático

const SITE = "https://usenotinha.com.br"; // página de sucesso fica aqui

// Em vez de servir HTML (o Supabase teima em entregar como texto cru),
// redirecionamos pro site, que renderiza a página com a cara do Notinha.
function redir(qs: string): Response {
  return new Response(null, { status: 302, headers: { Location: `${SITE}/conectado.html?${qs}` } });
}

function sbHeaders() {
  return {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

// ── state opaco: uso único, com validade (tabela oauth_states) ──
async function sha256hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function resolverState(state: string): Promise<string | null> {
  const hash = await sha256hex(state);
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/oauth_states?state_hash=eq.${hash}&usado_em=is.null&select=id,cliente_id,expira_em`,
    { headers: sbHeaders() });
  const row = (await r.json())?.[0];
  if (!row) return null;
  if (new Date(row.expira_em) < new Date()) return null;
  await fetch(`${SUPABASE_URL}/rest/v1/oauth_states?id=eq.${row.id}`, {
    method: "PATCH", headers: sbHeaders(),
    body: JSON.stringify({ usado_em: new Date().toISOString() }),
  });
  return row.cliente_id;
}

// ── código de ativação: alfabeto sem ambiguidade, sorteio criptográfico ──
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function sortearCodigo(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (n) => ALFABETO[n % ALFABETO.length]).join("");
}

async function gerarCodigoUnico(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const c = sortearCodigo();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?codigo_ativacao=eq.${c}&select=id&limit=1`,
      { headers: sbHeaders() });
    if (((await r.json()) ?? []).length === 0) return c;
  }
  return sortearCodigo();
}

// ── token de entrega do código (vai no fragment, nunca na query) ──
function novoToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // token opaco (oauth_states)
  const err   = url.searchParams.get("error");

  console.log("REQ", req.method, url.pathname, "state:", state, "err:", err);

  if (err)            return redir("erro=cancelado");
  if (!code || !state) return redir("erro=link");

  try {
    // 0) valida o state pela tabela: precisa existir, estar dentro da validade
    //    que quem criou definiu, e nunca ter sido usado
    const clienteId = await resolverState(state);
    if (!clienteId) return redir("erro=link");

    // 1) troca o código por tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error("token error:", JSON.stringify(tokens));
      return redir("erro=token");
    }
    const accessToken  = tokens.access_token;
    const refreshToken = tokens.refresh_token; // só vem com access_type=offline & prompt=consent

    // 2) email/sub do usuário
    const userInfo = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })).json();
    const googleEmail = userInfo.email ?? null;
    const googleSub   = userInfo.sub ?? null;

    // 3) cria a pasta raiz "Notinha"
    const folder = await (await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Notinha", mimeType: "application/vnd.google-apps.folder" }),
    })).json();
    const folderId = folder.id;

    // 4) cria a planilha mestre DENTRO da pasta
    const sheetFile = await (await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Notinha - Notas Fiscais",
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [folderId],
      }),
    })).json();
    const sheetId = sheetFile.id;

    // 4b) escreve o cabeçalho da planilha (Sheets API funciona pois o app criou o arquivo)
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:J1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          values: [[
            "Data", "Estabelecimento", "Endereço", "Categoria",
            "Valor Bruto", "Desconto", "Valor Total", "Pagamento",
            "Código NF", "Imagem (Drive)",
          ]],
        }),
      },
    );

    // 5) salva no cliente. O código de ativação só é gerado se ainda não existir —
    //    reconectar o Drive nunca invalida o código que o cliente já tem em mãos.
    const rAtual = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}&select=codigo_ativacao`,
      { headers: sbHeaders() });
    const jaTem = (await rAtual.json())?.[0]?.codigo_ativacao ?? null;

    const patch: Record<string, unknown> = {
      google_email: googleEmail,
      google_sub: googleSub,
      drive_folder_id: folderId,
      sheet_id: sheetId,
      onboarding_completo: true,
    };
    if (refreshToken) patch.drive_refresh_token = refreshToken;
    const codigo = jaTem ?? await gerarCodigoUnico();
    if (!jaTem) {
      patch.codigo_ativacao  = codigo;
      patch.codigo_gerado_em = new Date().toISOString();
    }

    const upd = await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}`, {
      method: "PATCH",
      headers: sbHeaders(),
      body: JSON.stringify(patch),
    });
    if (!upd.ok) console.error("supabase patch error:", await upd.text());

    console.log("OK cliente", clienteId, "folder", folderId, "sheet", sheetId, "refresh?", !!refreshToken);

    // 6) entrega o código por token no fragment — nunca na query string
    //    (query vira histórico do navegador e page_location do GA4)
    const t = novoToken();
    const rTok = await fetch(`${SUPABASE_URL}/rest/v1/ativacao_tokens`, {
      method: "POST", headers: sbHeaders(),
      body: JSON.stringify({ token_hash: await sha256hex(t), cliente_id: clienteId }),
    });
    if (!rTok.ok) console.error("ativacao_tokens insert error:", await rTok.text());

    return new Response(null, {
      status: 302,
      headers: { Location: `${SITE}/conectado.html#t=${t}` },
    });
  } catch (e) {
    console.error("oauth-callback error:", e);
    return redir("erro=inesperado");
  }
});
