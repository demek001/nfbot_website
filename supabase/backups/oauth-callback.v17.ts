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

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // = cliente_id (UUID)
  const err   = url.searchParams.get("error");

  console.log("REQ", req.method, url.pathname, "state:", state, "err:", err);

  if (err)            return redir("erro=cancelado");
  if (!code || !state) return redir("erro=link");

  try {
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

    // 5) gera código de ativação e salva no cliente (state = cliente_id)
    const codigo = Math.random().toString(36).slice(2, 8).toUpperCase();
    const patch: Record<string, unknown> = {
      google_email: googleEmail,
      google_sub: googleSub,
      drive_folder_id: folderId,
      sheet_id: sheetId,
      onboarding_completo: true,
      codigo_ativacao: codigo,
    };
    if (refreshToken) patch.drive_refresh_token = refreshToken;

    const upd = await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${state}`, {
      method: "PATCH",
      headers: sbHeaders(),
      body: JSON.stringify(patch),
    });
    if (!upd.ok) console.error("supabase patch error:", await upd.text());

    console.log("OK cliente", state, "folder", folderId, "sheet", sheetId, "refresh?", !!refreshToken);

    // 6) redireciona pra página de sucesso no site (com cara do Notinha)
    const qs = new URLSearchParams({ code: codigo, email: googleEmail ?? "" }).toString();
    return redir(qs);
  } catch (e) {
    console.error("oauth-callback error:", e);
    return redir("erro=inesperado");
  }
});
