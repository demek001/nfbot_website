// ═══════════════════════════════════════════════════════════════════════════
// NOTINHA — Edge Function: whatsapp-webhook  (FINA / outbox)
//
// Só faz 3 coisas:
//   1. GET  → responde o desafio de verificação do WhatsApp.
//   2. POST → enfileira CADA mensagem do pacote em `webhook_events` (dedup pela
//             coluna única `wam_id`) e responde 200 NA HORA. Sem processamento
//             inline. Manda um aviso curto "recebi" citando cada foto enviada.
//   3. Avisa o cliente (reply na foto) + acorda o worker `processar-fila`, tudo
//      em segundo plano. O cron a cada 1 min segue como rede de segurança.
//
// Formato gravado em payload: { value, msg } — exatamente o que o
// processar-fila lê (ev.payload.value / ev.payload.msg).
//
// Config da função: Verify JWT = OFF.
// Secrets usadas: WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN, SUPABASE_URL,
//                 SUPABASE_SERVICE_ROLE_KEY, WORKER_SECRET.
// ═══════════════════════════════════════════════════════════════════════════

const VERIFY_TOKEN  = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("WORKER_SECRET") ?? "";
const WORKER_URL    = `${SUPABASE_URL}/functions/v1/processar-fila`;
const GRAPH          = "https://graph.facebook.com/v23.0";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";

function sbHeaders(extra: Record<string, string> = {}) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...extra };
}

// enfileira o evento; retorna 'novo' | 'duplicado' | 'erro'
async function enfileirar(wamId: string, telefone: string, payload: unknown): Promise<"novo" | "duplicado" | "erro"> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/webhook_events`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ wam_id: wamId, telefone, payload }),
  });
  if (r.status === 409) return "duplicado";              // reentrega do WhatsApp → já está na fila
  if (!r.ok) { console.error("enfileirar erro", r.status, await r.text().catch(() => "")); return "erro"; }
  return "novo";
}

// acorda o worker (não espera a resposta — só dispara)
async function dispararWorker() {
  try {
    await fetch(WORKER_URL, { method: "POST", headers: { "x-worker-secret": WORKER_SECRET } });
  } catch (e) { console.error("dispararWorker", String(e)); }
}

// o aviso "📸 Recebi!" só sai para número já ativado — número desconhecido
// recebe apenas o "não reconheço" do processar-fila, e nada confirma pra fora
// que o webhook existe. Mesmo filtro que o processar-fila usa (telefone=eq).
async function conhecido(telefone: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?telefone=eq.${telefone}&ativado=is.true&select=id&limit=1`,
      { headers: sbHeaders() });
    return ((await r.json()) ?? []).length > 0;
  } catch (e) {
    console.error("conhecido", String(e));
    return false;
  }
}

// avisa o cliente NA HORA que a nota chegou, citando (reply) a própria foto
// enviada — assim o vínculo é visual mesmo com várias fotos no mesmo segundo.
async function avisarRecebido(value: any, msg: any) {
  try {
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!phoneNumberId || !WHATSAPP_TOKEN) return;
    await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.from,
        context: { message_id: msg.id },
        type: "text",
        text: { body: "📸 Recebi! Tô lendo essa nota, já te respondo. 🙂" },
      }),
    });
  } catch (e) { console.error("avisarRecebido", String(e)); }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 1. Verificação do WhatsApp (GET)
  if (req.method === "GET") {
    if (url.searchParams.get("hub.verify_token") === VERIFY_TOKEN)
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let payload: any;
  try { payload = await req.json(); } catch { return new Response("EVENT_RECEIVED", { status: 200 }); }

  // 2. Percorre TODAS as mensagens do pacote (quando a pessoa envia várias fotos
  //    de uma vez, o WhatsApp pode entregar várias em messages[]).
  const novos: { value: any; msg: any }[] = [];
  for (const entry of (payload?.entry ?? [])) {
    for (const change of (entry?.changes ?? [])) {
      const value = change?.value;
      for (const msg of (value?.messages ?? [])) {
        const wamId = msg.id ?? crypto.randomUUID();
        const res = await enfileirar(wamId, msg.from, { value, msg });
        // Se falhou ao enfileirar (e NÃO é duplicado), devolve != 200 → WhatsApp
        // reenvia. wam_id único garante dedup, então nada se perde nem duplica.
        if (res === "erro") return new Response("enqueue_failed", { status: 500 });
        if (res === "novo") novos.push({ value, msg });
      }
    }
  }

  // 3. Eventos novos → avisa o cliente (citando cada foto) e acorda o worker,
  //    tudo em segundo plano pra não segurar o 200.
  if (novos.length > 0) {
    const tarefa = async () => {
      for (const n of novos) {
        if ((n.msg.type === "image" || n.msg.type === "document") && await conhecido(n.msg.from)) {
          await avisarRecebido(n.value, n.msg);
        }
      }
      await dispararWorker();
    };
    // @ts-ignore EdgeRuntime existe no runtime do Supabase
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(tarefa());
    else tarefa();
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
});
