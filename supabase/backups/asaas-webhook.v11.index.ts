// ═════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: asaas-webhook
// Recebe eventos do Asaas → atualiza pagamento_status do cliente.
// pago = acesso liberado · atraso/refund/cancelamento = bloqueado.
// Após pagamento: gera codigo_ativacao e dispara e-mail de boas-vindas.
// Verify JWT = OFF. Auth via header asaas-access-token = ASAAS_WEBHOOK_TOKEN.
// NÃO altera clientes com status "cortesia".
// Secrets: ASAAS_WEBHOOK_TOKEN, WEBHOOK_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═════════════════════════════════════════════════════════════════

const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN")!;
const NOTIFY_TOKEN  = Deno.env.get("WEBHOOK_TOKEN")!;   // auth interna p/ enviar-boasvindas
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Eventos → novo status
const LIBERA  = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const BLOQUEIA = new Set([
  "PAYMENT_OVERDUE", "PAYMENT_REFUNDED", "PAYMENT_DELETED",
  "PAYMENT_REVERSED", "PAYMENT_CHARGEBACK_REQUESTED",
  "SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED",
]);

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

async function setStatus(filtro: string, status: string) {
  // neq.cortesia protege os 3 donos/cortesia de qualquer evento
  await fetch(
    `${SUPABASE_URL}/rest/v1/clientes?${filtro}&pagamento_status=neq.cortesia`,
    { method: "PATCH", headers: sbHeaders(), body: JSON.stringify({ pagamento_status: status }) },
  );
}

// Gera o codigo_ativacao no 1º pagamento confirmado.
// Idempotente: se já existe código, não faz nada (renovação mensal não regrava).
// Nunca mexe em cliente "cortesia". Nunca derruba o webhook — erro só vira log.
// Devolve o id do cliente (pra disparar o e-mail de boas-vindas) ou null.
async function garantirCodigo(filtro: string): Promise<string | null> {
  try {
    const sel = `${SUPABASE_URL}/rest/v1/clientes?${filtro}&select=id,codigo_ativacao,pagamento_status`;
    const r = await fetch(sel, { headers: sbHeaders() });
    if (!r.ok) { console.error("garantirCodigo select", r.status, await r.text()); return null; }

    const rows = await r.json();
    const c = rows?.[0];
    if (!c) return null;
    if (c.pagamento_status === "cortesia") return null; // dono/cortesia: já tem código manual
    if (c.codigo_ativacao) return c.id;                  // já gerado → e-mail ainda pode faltar

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
      if (up.ok) { console.log(`codigo_ativacao gerado cliente=${c.id}`); return c.id; }
      if (up.status === 409) continue;                // código repetido → tenta de novo
      console.error("garantirCodigo patch", up.status, await up.text());
      return c.id;
    }
    console.error("garantirCodigo: 5 colisoes seguidas", c.id);
    return c.id;
  } catch (e) {
    console.error("garantirCodigo excecao", String(e));
    return null;
  }
}

// Dispara o e-mail de boas-vindas (função enviar-boasvindas é idempotente).
// Falha aqui nunca derruba o webhook — só vira log.
async function dispararBoasVindas(clienteId: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/enviar-boasvindas`, {
      method: "POST",
      headers: { "x-webhook-token": NOTIFY_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ cliente_id: clienteId }),
    });
    console.log(`boas-vindas disparo cliente=${clienteId} status=${r.status}`);
  } catch (e) {
    console.error("dispararBoasVindas excecao", String(e));
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

  let novo: string | null = null;
  if (LIBERA.has(evento))   novo = "ativo";
  else if (BLOQUEIA.has(evento)) novo = "bloqueado";

  // evento que não interessa → 200 e ignora (evita retry do Asaas)
  if (!novo) return new Response(JSON.stringify({ ok: true, ignored: evento }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });

  const filtro = filtroCliente(pay, sub);
  if (!filtro) {
    console.error("asaas-webhook sem chave de cliente", JSON.stringify(body));
    return new Response(JSON.stringify({ ok: true, no_match: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  await setStatus(filtro, novo);
  if (novo === "ativo") {
    const clienteId = await garantirCodigo(filtro);
    if (clienteId) await dispararBoasVindas(clienteId);
  }
  console.log(`asaas-webhook ${evento} → ${novo} (${filtro})`);

  return new Response(JSON.stringify({ ok: true, evento, status: novo }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
