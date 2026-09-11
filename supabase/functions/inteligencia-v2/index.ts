// NOTINHA — Intelligence Engine v2
// Internal API only. No AI/model calls and no outbound messages.
// Auth: x-worker-secret (same internal secret used by other Notinha workers).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("WORKER_SECRET") ?? "";

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function rpc(name: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    console.error("inteligencia-v2 rpc error", name, res.status);
    throw new Error(`rpc_${name}_${res.status}`);
  }
  return data;
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, erro: "method_not_allowed" }, 405);

  const incomingSecret = req.headers.get("x-worker-secret") ?? "";
  if (!WORKER_SECRET || incomingSecret !== WORKER_SECRET) {
    return json({ ok: false, erro: "unauthorized" }, 401);
  }

  let body: any;
  try { body = await req.json(); }
  catch { return json({ ok: false, erro: "invalid_json" }, 400); }

  const acao = String(body?.acao ?? "").trim().toLowerCase();
  const clienteId = body?.cliente_id;

  const precisaCliente = !["refresh_all", "alertas_pendentes"].includes(acao);
  if (precisaCliente && !isUuid(clienteId)) {
    return json({ ok: false, erro: "cliente_id_invalido" }, 400);
  }

  try {
    switch (acao) {
      case "refresh": {
        const resultado = await rpc("gerar_inteligencia_cliente_v2", { p_cliente_id: clienteId });
        return json({ ok: true, resultado });
      }
      case "refresh_all": {
        const resultado = await rpc("refresh_inteligencia_all_v2");
        return json({ ok: true, resultado });
      }
      case "feed": {
        const limite = Math.max(1, Math.min(Number(body?.limite ?? 10), 25));
        const itens = await rpc("listar_inteligencia_cliente_v2", { p_cliente_id: clienteId, p_limit: limite });
        return json({ ok: true, itens });
      }
      case "recorrencias": {
        const resumo = await rpc("resumo_recorrencias_mensais_v2", { p_cliente_id: clienteId });
        return json({ ok: true, resumo });
      }
      case "confirmar_recorrencia":
      case "ignorar_recorrencia":
      case "encerrar_recorrencia": {
        if (!isUuid(body?.recorrencia_id)) return json({ ok: false, erro: "recorrencia_id_invalido" }, 400);
        const mapa: Record<string, string> = {
          confirmar_recorrencia: "confirmar",
          ignorar_recorrencia: "ignorar",
          encerrar_recorrencia: "encerrar",
        };
        const resultado = await rpc("confirmar_recorrencia_v2", {
          p_cliente_id: clienteId,
          p_recorrencia_id: body.recorrencia_id,
          p_acao: mapa[acao],
        });
        return json({ ok: true, resultado });
      }
      case "marcar_insight": {
        if (!isUuid(body?.insight_id)) return json({ ok: false, erro: "insight_id_invalido" }, 400);
        const permitido = ["visto", "descartar", "resolver"];
        const gesto = String(body?.gesto ?? "").toLowerCase();
        if (!permitido.includes(gesto)) return json({ ok: false, erro: "gesto_invalido" }, 400);
        const resultado = await rpc("marcar_insight_v2", {
          p_cliente_id: clienteId,
          p_insight_id: body.insight_id,
          p_acao: gesto,
        });
        return json({ ok: true, resultado });
      }
      case "radar_preco": {
        const termo = String(body?.termo ?? "").trim().slice(0, 100);
        if (!termo) return json({ ok: false, erro: "termo_obrigatorio" }, 400);
        const resultados = await rpc("radar_preco_local_v2", { p_cliente_id: clienteId, p_termo: termo });
        return json({ ok: true, resultados, privacidade: "minimo_3_outros_consumidores_por_estabelecimento" });
      }
      case "posso_gastar": {
        const valor = Number(body?.valor);
        if (!Number.isFinite(valor) || valor < 0) return json({ ok: false, erro: "valor_invalido" }, 400);
        const resultado = await rpc("simular_posso_gastar_v2", { p_cliente_id: clienteId, p_valor: valor });
        return json({ ok: true, resultado });
      }
      case "criar_lembrete": {
        const descricao = String(body?.descricao ?? "").trim().slice(0, 300);
        const devido = String(body?.devido_em ?? "").trim();
        const tipo = String(body?.tipo ?? "geral").trim().slice(0, 60);
        const canal = String(body?.canal ?? "in_app").trim().toLowerCase();
        if (!descricao || !devido) return json({ ok: false, erro: "lembrete_invalido" }, 400);
        if (!["in_app", "email", "whatsapp"].includes(canal)) return json({ ok: false, erro: "canal_invalido" }, 400);
        const id = await rpc("criar_lembrete_v2", {
          p_cliente_id: clienteId,
          p_tipo: tipo,
          p_descricao: descricao,
          p_devido_em: devido,
          p_recorrencia: body?.recorrencia ?? null,
          p_canal: canal,
        });
        // External delivery remains disabled at DB level until explicitly enabled.
        return json({ ok: true, id, envio_externo_habilitado: false });
      }
      case "lembretes": {
        const limite = Math.max(1, Math.min(Number(body?.limite ?? 20), 50));
        const itens = await rpc("listar_lembretes_cliente_v2", { p_cliente_id: clienteId, p_limit: limite });
        return json({ ok: true, itens });
      }
      case "alertas_pendentes": {
        const filtroCliente = body?.cliente_id;
        if (filtroCliente != null && !isUuid(filtroCliente)) return json({ ok: false, erro: "cliente_id_invalido" }, 400);
        const limite = Math.max(1, Math.min(Number(body?.limite ?? 100), 500));
        const itens = await rpc("alertas_pendentes_v2", { p_cliente_id: filtroCliente ?? null, p_limit: limite });
        return json({ ok: true, itens });
      }
      default:
        return json({ ok: false, erro: "acao_invalida" }, 400);
    }
  } catch (e) {
    console.error("inteligencia-v2", acao, String(e));
    return json({ ok: false, erro: "internal_error" }, 500);
  }
});
