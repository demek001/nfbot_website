// ════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: conta
// Painel de conta do usuário (página conta.html no site).
//
// Login: Supabase Auth (e-mail + senha) no navegador. O front faz o
// signIn e manda o access_token aqui no header Authorization. Esta
// função valida o token, descobre o e-mail, acha o cliente e executa
// a ação pedida.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   SUPABASE_URL                → URL do projeto
//   SUPABASE_SERVICE_ROLE_KEY   → service role (lê/escreve clientes)
//   ASAAS_API_KEY               → chave do Asaas ($aact_...)
//   NOTINHA_WA_NUMERO           → número do bot, só dígitos (ex: 5513996286090)
// ════════════════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY") ?? "";
const WA_NUMERO = Deno.env.get("NOTINHA_WA_NUMERO") ?? "5513996286090";

// Asaas: produção. Se usar sandbox, troque para sandbox.asaas.com.
const ASAAS_BASE = "https://api.asaas.com/v3";

// Alfabeto sem caracteres ambíguos (0/O, 1/I) — código é ditado por WhatsApp
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function sortearCodigo(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (n) => ALFABETO[n % ALFABETO.length]).join("");
}

// Preços dos planos (mensal)
const PRECO_PREMIUM = 44.90;
const PRECO_BASE = 14.90;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function asaas(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "access_token": ASAAS_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "metodo_invalido" }, 405);

  try {
    // ── 1) Autenticação: valida o access_token do usuário ──────────
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ erro: "sem_token" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user?.email) {
      return json({ erro: "token_invalido" }, 401);
    }
    const email = userData.user.email.toLowerCase();

    // ── 2) Acha o cliente pelo e-mail ──────────────────────────────
    const { data: cliente, error: cliErr } = await sb
      .from("clientes")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    if (cliErr) return json({ erro: "erro_busca", detalhe: cliErr.message }, 500);
    if (!cliente) return json({ erro: "cliente_nao_encontrado" }, 404);

    const { acao, motivo, nome } = await req.json().catch(() => ({ acao: "perfil" }));

    // ── PERFIL ─────────────────────────────────────────────────────
    if (!acao || acao === "perfil") {
      return json({
        ok: true,
        cliente: {
          nome: cliente.nome,
          email: cliente.email,
          telefone: cliente.telefone,
          plano_tier: cliente.plano_tier,
          pagamento_status: cliente.pagamento_status,
          ativado: cliente.ativado,
          cancelado_em: cliente.cancelado_em,
          drive_folder_id: cliente.drive_folder_id,
          sheet_id: cliente.sheet_id,
        },
      });
    }

    // ── TROCAR NOME ────────────────────────────────────────────────
    if (acao === "trocar_nome") {
      const novo = (nome ?? "").toString().trim();
      if (!novo) return json({ erro: "nome_vazio", msg: "O nome não pode ficar vazio." }, 400);
      if (novo.length > 80) return json({ erro: "nome_longo", msg: "Nome muito longo (máx. 80 caracteres)." }, 400);
      await sb.from("clientes").update({ nome: novo }).eq("id", cliente.id);
      return json({ ok: true, msg: "Nome atualizado.", nome: novo });
    }

    // ── UPGRADE PREMIUM ────────────────────────────────────────────
    // Atualiza o valor da assinatura no Asaas e o tier no banco.
    if (acao === "upgrade") {
      if (cliente.plano_tier === "premium") {
        return json({ ok: true, msg: "Você já é Premium." });
      }
      if (!cliente.asaas_subscription_id) {
        return json({ erro: "sem_assinatura" }, 400);
      }
      const r = await asaas(
        `/subscriptions/${cliente.asaas_subscription_id}`,
        "POST",
        { value: PRECO_PREMIUM, description: "Notinha Premium" },
      );
      if (!r.ok) return json({ erro: "asaas_falhou", detalhe: r.data }, 502);

      await sb.from("clientes")
        .update({ plano_tier: "premium" })
        .eq("id", cliente.id);

      return json({ ok: true, msg: "Upgrade para Premium feito! Insights semanais e mensais ativados." });
    }

    // ── DOWNGRADE PARA BASE ────────────────────────────────────────
    // Reduz o valor da assinatura no Asaas e o tier no banco.
    if (acao === "downgrade") {
      if (cliente.plano_tier === "base") {
        return json({ ok: true, msg: "Você já está no plano Base." });
      }
      if (!cliente.asaas_subscription_id) {
        return json({ erro: "sem_assinatura" }, 400);
      }
      const r = await asaas(
        `/subscriptions/${cliente.asaas_subscription_id}`,
        "POST",
        { value: PRECO_BASE, description: "Notinha Base" },
      );
      if (!r.ok) return json({ erro: "asaas_falhou", detalhe: r.data }, 502);

      await sb.from("clientes")
        .update({ plano_tier: "base" })
        .eq("id", cliente.id);

      return json({ ok: true, msg: "Plano alterado para Base. A mudança vale a partir da próxima cobrança." });
    }

    // ── TROCAR FORMA DE PAGAMENTO ──────────────────────────────────
    // Devolve a URL da fatura pendente; o cliente paga lá e pode trocar
    // o método na própria página do Asaas.
    if (acao === "trocar_pagamento") {
      if (!cliente.asaas_subscription_id) {
        return json({ erro: "sem_assinatura" }, 400);
      }
      const r = await asaas(
        `/payments?subscription=${cliente.asaas_subscription_id}&status=PENDING`,
      );
      if (!r.ok) return json({ erro: "asaas_falhou", detalhe: r.data }, 502);
      const fatura = r.data?.data?.[0]?.invoiceUrl;
      if (!fatura) return json({ erro: "sem_fatura_pendente" }, 404);
      return json({ ok: true, invoiceUrl: fatura });
    }

    // ── TROCAR TELEFONE ────────────────────────────────────────────
    // Gera novo código e desliga a ativação. O número novo é revinculado
    // quando ENVIAR "ATIVAR {codigo}" pelo WhatsApp (o webhook regrava telefone).
    if (acao === "trocar_telefone") {
      const codigo = sortearCodigo();
      // codigo_usado_em volta a null: o ATIVAR do número novo aceita este código
      // uma vez. codigo_gerado_em reabre a janela de 30 dias.
      await sb.from("clientes")
        .update({
          codigo_ativacao: codigo,
          ativado: false,
          codigo_usado_em: null,
          codigo_gerado_em: new Date().toISOString(),
        })
        .eq("id", cliente.id);
      const link = WA_NUMERO
        ? `https://wa.me/${WA_NUMERO}?text=${encodeURIComponent("ATIVAR " + codigo)}`
        : null;
      return json({
        ok: true, codigo, link,
        msg: "Envie a mensagem pelo número novo para revincular o WhatsApp.",
      });
    }

    // ── CANCELAR ───────────────────────────────────────────────────
    // Cancela a cobrança no Asaas e marca o cliente. Os dados dele
    // (notas no Drive dele) continuam — exclusão é fluxo separado.
    if (acao === "cancelar") {
      if (cliente.asaas_subscription_id) {
        await asaas(`/subscriptions/${cliente.asaas_subscription_id}`, "DELETE");
      }
      await sb.from("clientes").update({
        cancelado_em: new Date().toISOString(),
        motivo_cancelamento: motivo ?? null,
        pagamento_status: "cancelado",
      }).eq("id", cliente.id);
      return json({ ok: true, msg: "Assinatura cancelada. Seus dados continuam no seu Drive." });
    }

    return json({ erro: "acao_invalida" }, 400);
  } catch (e) {
    return json({ erro: "excecao", detalhe: String(e) }, 500);
  }
});
