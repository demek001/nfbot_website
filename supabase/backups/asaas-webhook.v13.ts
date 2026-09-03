// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: asaas-webhook
// Recebe eventos do Asaas → atualiza o cliente e dispara o e-mail certo.
// Pagamento OK, PRIMEIRA pergunta: é renovação?
//   email_boasvindas_enviado = true  → e-mail REN (confirmação) e nada mais.
//   novo cliente                     → garante codigo_ativacao + e-mail BV.
// Reembolso    → bloqueia + e-mail "reembolso confirmado" (garantia).
// Cancelamento → bloqueia + e-mail "cancelamento confirmado" (a menos que
//                já tenha sido reembolsado — aí não manda 2º e-mail).
// Atraso       → CARÊNCIA: serviço segue ativo, marca inadimplente_desde e
//                avisa (D0); o cron emails-recuperacao pausa após 3 dias.
// Chargeback   → bloqueia + alerta interno pra suporte@ (nunca o cliente).
// Verify JWT = OFF. Auth via header asaas-access-token = ASAAS_WEBHOOK_TOKEN.
// NÃO altera clientes com status "cortesia".
// Secrets: ASAAS_WEBHOOK_TOKEN, WEBHOOK_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═════════════════════════════════════════════════════════════════

const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN")!;
const NOTIFY_TOKEN  = Deno.env.get("WEBHOOK_TOKEN")!;   // auth interna p/ enviar-boasvindas
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Eventos → ação
const LIBERA     = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const REEMBOLSA  = new Set(["PAYMENT_REFUNDED", "PAYMENT_REVERSED"]);
const CANCELA    = new Set(["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"]);
const INADIMPLE  = new Set(["PAYMENT_OVERDUE"]);
const CHARGEBACK = new Set(["PAYMENT_CHARGEBACK_REQUESTED"]);
const BLOQUEIA   = new Set(["PAYMENT_DELETED"]); // ação administrativa, sem e-mail

function sbHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// Acha o filtro do cliente: externalReference > subscription > customer
function filtroCliente(p: any, s: any): string | null {
  const ref = p?.externalReference ?? s?.externalReference;
  if (ref) return `id=eq.${ref}`;
  if (p?.subscription) return `asaas_subscription_id=eq.${p.subscription}`;
  if (s?.id)           return `asaas_subscription_id=eq.${s.id}`;
  if (p?.customer)     return `asaas_customer_id=eq.${p.customer}`;
  return null;
}

// PATCH no cliente do evento. neq.cortesia protege os donos/cortesia de
// qualquer evento; extraFiltro permite condições extras (ex.: só se ainda
// não estava inadimplente).
async function patchCliente(filtro: string, body: Record<string, unknown>, extraFiltro = "") {
  await fetch(
    `${SUPABASE_URL}/rest/v1/clientes?${filtro}&pagamento_status=neq.cortesia${extraFiltro}`,
    { method: "PATCH", headers: sbHeaders(), body: JSON.stringify(body) },
  );
}

// Busca o cliente do evento (1 select só; decide o branch do e-mail).
// Nunca derruba o webhook — erro só vira log.
async function buscarCliente(filtro: string): Promise<any | null> {
  try {
    const sel = `${SUPABASE_URL}/rest/v1/clientes?${filtro}&select=id,codigo_ativacao,pagamento_status,email_boasvindas_enviado,motivo_cancelamento`;
    const r = await fetch(sel, { headers: sbHeaders() });
    if (!r.ok) { console.error("buscarCliente select", r.status, await r.text()); return null; }
    return (await r.json())?.[0] ?? null;
  } catch (e) {
    console.error("buscarCliente excecao", String(e));
    return null;
  }
}

// Gera o codigo_ativacao no 1º pagamento confirmado.
// Idempotente: se já existe código, não faz nada.
// Nunca derruba o webhook — erro só vira log.
async function garantirCodigo(c: any): Promise<void> {
  try {
    if (c.codigo_ativacao) return; // já gerado → e-mail ainda pode faltar

    // codigo_ativacao é UNIQUE. Colisão (409) → sorteia outro.
    for (let i = 0; i < 5; i++) {
      const codigo = "NT" + Math.random().toString(36).slice(2, 8).toUpperCase();
      const up = await fetch(
        `${SUPABASE_URL}/rest/v1/clientes?id=eq.${c.id}&codigo_ativacao=is.null`,
        {
          method: "PATCH",
          headers: sbHeaders({ Prefer: "return=representation" }),
          body: JSON.stringify({ codigo_ativacao: codigo }),
        },
      );
      if (up.ok) { console.log(`codigo_ativacao gerado cliente=${c.id}`); return; }
      if (up.status === 409) continue;                // código repetido → tenta de novo
      console.error("garantirCodigo patch", up.status, await up.text());
      return;
    }
    console.error("garantirCodigo: 5 colisoes seguidas", c.id);
  } catch (e) {
    console.error("garantirCodigo excecao", String(e));
  }
}

// Dispara o e-mail transacional (função enviar-boasvindas é idempotente).
// tipo: boas_vindas | renovacao | reembolso | cancelamento | cobranca_falhou
//       | chargeback (alerta interno). ref = payment/subscription id.
// Falha aqui nunca derruba o webhook — só vira log.
async function dispararEmail(clienteId: string, tipo: string, ref: string | null) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/enviar-boasvindas`, {
      method: "POST",
      headers: { "x-webhook-token": NOTIFY_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ cliente_id: clienteId, tipo, ref }),
    });
    console.log(`email ${tipo} disparo cliente=${clienteId} status=${r.status}`);
  } catch (e) {
    console.error("dispararEmail excecao", String(e));
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  // auth
  if (req.headers.get("asaas-access-token") !== WEBHOOK_TOKEN) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad_json", { status: 400 }); }

  const evento = String(body?.event ?? "");
  const pay = body?.payment ?? null;
  const sub = body?.subscription ?? null;

  let acao: string | null = null;
  if (LIBERA.has(evento))          acao = "libera";
  else if (REEMBOLSA.has(evento))  acao = "reembolso";
  else if (CANCELA.has(evento))    acao = "cancelamento";
  else if (INADIMPLE.has(evento))  acao = "inadimplente";
  else if (CHARGEBACK.has(evento)) acao = "chargeback";
  else if (BLOQUEIA.has(evento))   acao = "bloqueia";

  // evento que não interessa → 200 e ignora (evita retry do Asaas)
  if (!acao) return new Response(JSON.stringify({ ok: true, ignored: evento }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });

  const filtro = filtroCliente(pay, sub);
  if (!filtro) {
    console.error("asaas-webhook sem chave de cliente", JSON.stringify(body));
    return new Response(JSON.stringify({ ok: true, no_match: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const c = await buscarCliente(filtro);
  if (c?.pagamento_status === "cortesia") {
    console.log(`asaas-webhook ${evento} ignorado (cortesia)`);
    return new Response(JSON.stringify({ ok: true, cortesia: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  const ref = pay?.id ? String(pay.id) : (sub?.id ? String(sub.id) : null);
  const agora = new Date().toISOString();

  switch (acao) {
    case "libera":
      // pagamento OK: reativa e zera a inadimplência
      await patchCliente(filtro, { pagamento_status: "ativo", inadimplente_desde: null });
      if (c) {
        if (c.email_boasvindas_enviado) {
          // Renovação: agradece e confirma o pagamento. Onboarding NÃO roda de novo.
          await dispararEmail(c.id, "renovacao", ref);
        } else {
          // Novo cliente: garante código e envia boas-vindas (seta a flag lá).
          await garantirCodigo(c);
          await dispararEmail(c.id, "boas_vindas", ref);
        }
      }
      break;

    case "reembolso":
      // garantia: reembolso é feito manualmente no Asaas; aqui só reagimos
      await patchCliente(filtro, {
        pagamento_status: "bloqueado", cancelado_em: agora,
        motivo_cancelamento: "reembolso", inadimplente_desde: null,
      });
      if (c) await dispararEmail(c.id, "reembolso", ref);
      break;

    case "cancelamento":
      if (c?.motivo_cancelamento === "reembolso") {
        // veio depois do reembolso (cancelar a assinatura faz parte do
        // procedimento) — só garante o bloqueio, sem 2º e-mail
        await patchCliente(filtro, { pagamento_status: "bloqueado" });
      } else {
        await patchCliente(filtro, {
          pagamento_status: "bloqueado", cancelado_em: agora,
          motivo_cancelamento: "cancelamento", inadimplente_desde: null,
        });
        if (c) await dispararEmail(c.id, "cancelamento", ref);
      }
      break;

    case "inadimplente":
      // carência de 3 dias: serviço segue ativo; o cron pausa quando vencer.
      // is.null preserva o início da inadimplência em OVERDUEs repetidos.
      if (c?.pagamento_status === "ativo") {
        await patchCliente(filtro, { inadimplente_desde: agora }, "&inadimplente_desde=is.null");
        await dispararEmail(c.id, "cobranca_falhou", ref);
      }
      break;

    case "chargeback":
      // contestação na operadora: bloqueia já e chama humano — nada ao cliente
      await patchCliente(filtro, { pagamento_status: "bloqueado" });
      if (c) await dispararEmail(c.id, "chargeback", ref);
      break;

    case "bloqueia":
      await patchCliente(filtro, { pagamento_status: "bloqueado" });
      break;
  }
  console.log(`asaas-webhook ${evento} → ${acao} (${filtro})`);

  return new Response(JSON.stringify({ ok: true, evento, acao }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
