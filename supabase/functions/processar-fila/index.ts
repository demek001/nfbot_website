import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
const GRAPH = "https://graph.facebook.com/v23.0";
const WHATSAPP_TOKEN       = Deno.env.get("WHATSAPP_TOKEN")!;
const GOOGLE_CLIENT_ID     = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GEMINI_API_KEY       = Deno.env.get("GEMINI_API_KEY") ?? "";
const OPENAI_API_KEY       = Deno.env.get("OPENAI_API_KEY") ?? "";
const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY         = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET        = Deno.env.get("WORKER_SECRET") ?? "";
function sbHeaders(extra: Record<string, string> = {}) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...extra };
}
async function sbSelect(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) { console.error("sbSelect erro", await r.text()); return []; }
  return await r.json();
}
async function sbPatch(path: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "PATCH", headers: sbHeaders({ Prefer: "return=representation" }), body: JSON.stringify(body) });
  if (!r.ok) console.error("sbPatch erro", await r.text());
  return r.ok ? await r.json() : null;
}
async function sbInsert(table: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers: sbHeaders({ Prefer: "return=representation" }), body: JSON.stringify(body) });
  if (!r.ok) { console.error("sbInsert erro", await r.text()); return null; }
  const j = await r.json();
  return Array.isArray(j) ? j[0] : j;
}
async function sbDelete(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "DELETE", headers: sbHeaders({ Prefer: "return=minimal" }) });
  if (!r.ok) console.error("sbDelete erro", await r.text());
}
async function gerarNfCodigo(clienteId: string, dataISO: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/gerar_nf_codigo`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_cliente_id: clienteId, p_data: dataISO }) });
  if (!r.ok) return `NF-${dataISO.replace(/-/g, "")}-000`;
  return await r.json();
}
async function sbRpc(fn: string, body: unknown): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: sbHeaders(), body: JSON.stringify(body) });
  if (!r.ok) { console.error("sbRpc", fn, await r.text()); return null; }
  return await r.json();
}
async function pastaDoCache(clienteId: string, chave: string): Promise<string | null> {
  const r = await sbSelect(`pastas_drive?cliente_id=eq.${clienteId}&chave=eq.${encodeURIComponent(chave)}&select=drive_id`);
  return r?.[0]?.drive_id ?? null;
}
async function salvarPastaCache(clienteId: string, chave: string, driveId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/pastas_drive?on_conflict=cliente_id,chave`, { method: "POST", headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify({ cliente_id: clienteId, chave, drive_id: driveId }) });
}
async function limparCachePastas(clienteId: string) { await sbDelete(`pastas_drive?cliente_id=eq.${clienteId}`); }
async function enviarWhats(phoneNumberId: string, to: string, texto: string): Promise<string | null> {
  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: texto } }) });
  const corpo = await r.text();
  console.log("Resposta WhatsApp API:", r.status, corpo.slice(0, 200));
  try { return JSON.parse(corpo)?.messages?.[0]?.id ?? null; } catch { return null; }
}
async function baixarImagem(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
  const meta = await metaRes.json();
  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
  const buf = new Uint8Array(await fileRes.arrayBuffer());
  return { bytes: buf, mime: meta.mime_type ?? "image/jpeg" };
}
class ErroGoogleAuth extends Error { constructor() { super("google_auth"); } }
async function googleAccessToken(refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  const j = await r.json();
  if (!j.access_token) { console.error("refresh erro", JSON.stringify(j)); throw new ErroGoogleAuth(); }
  return j.access_token;
}
async function criarPastaSimples(token: string, nome: string, parentId: string | null): Promise<string> {
  const body: Record<string, unknown> = { name: nome, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) body.parents = [parentId];
  const r = await fetch("https://www.googleapis.com/drive/v3/files", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await r.json()).id;
}
async function acharOuCriarPasta(token: string, parentId: string, nome: string): Promise<string> {
  const q = encodeURIComponent(`'${parentId}' in parents and name='${nome}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const buscaRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, { headers: { Authorization: `Bearer ${token}` } });
  const busca = await buscaRes.json().catch(() => ({}));
  if (busca?.files && busca.files.length > 0) return busca.files[0].id;
  return await criarPastaSimples(token, nome, parentId);
}
async function garantirPasta(token: string, clienteId: string, chave: string, nome: string, parentId: string): Promise<string> {
  const cache = await pastaDoCache(clienteId, chave);
  if (cache) return cache;
  const id = await acharOuCriarPasta(token, parentId, nome);
  await salvarPastaCache(clienteId, chave, id);
  return id;
}
async function garantirRaiz(token: string, cliente: any): Promise<{ id: string; recriada: boolean }> {
  if (cliente.drive_folder_id) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${cliente.drive_folder_id}?fields=id,trashed`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) { const j = await r.json().catch(() => ({})); if (j && j.trashed !== true) return { id: cliente.drive_folder_id, recriada: false }; }
  }
  const novo = await criarPastaSimples(token, "Notinha", null);
  await sbPatch(`clientes?id=eq.${cliente.id}`, { drive_folder_id: novo });
  await limparCachePastas(cliente.id);
  cliente.drive_folder_id = novo;
  return { id: novo, recriada: true };
}
async function garantirPastaMes(token: string, cliente: any, dataISO: string | null): Promise<string> {
  const am = anoMes(dataISO);
  const anoId = await garantirPasta(token, cliente.id, am.ano, am.ano, cliente.drive_folder_id);
  const mesId = await garantirPasta(token, cliente.id, `${am.ano}/${am.mes}`, am.mes, anoId);
  return mesId;
}
async function subirImagem(token: string, pastaId: string, nome: string, bytes: Uint8Array, mime: string): Promise<string> {
  const metaRes = await fetch("https://www.googleapis.com/drive/v3/files", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: nome, parents: [pastaId] }) });
  const fileId = (await metaRes.json()).id;
  await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": mime }, body: bytes });
  return fileId;
}
async function moverArquivo(token: string, fileId: string, novoPaiId: string, antigoPaiId?: string) {
  const params = new URLSearchParams({ addParents: novoPaiId, fields: "id,parents" });
  if (antigoPaiId) params.set("removeParents", antigoPaiId);
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
}
async function moverParaPasta(token: string, fileId: string, destinoId: string) {
  const cur = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await cur.json().catch(() => ({}));
  const antigos = Array.isArray(j?.parents) ? j.parents.join(",") : undefined;
  await moverArquivo(token, fileId, destinoId, antigos);
}
const HEADER_NOTAS = ["Data","Estabelecimento","Endereço","Categoria","Valor Bruto","Desconto","Valor Total","Pagamento","Código NF","ICMS","PIS","COFINS","IPI","II","CBS","IBS","IS","Tributos aprox.","Imagem (Drive)"];
const HEADER_ITENS = ["Data","Código NF","Descrição","Categoria","Qtd","Unidade","Valor Unit.","Valor Total Item","Desconto Item","EAN","NCM"];
const HEADER_ENTRADAS = ["Data","Descrição","Categoria","Valor"];
const ANCHOR_NOTAS = "Notas!A2";
const ANCHOR_ITENS = "Itens!A1";
const ANCHOR_ENTRADAS = "Entradas!A2";
const CATEGORIAS = ["Alimentação","Mercado","Farmácia","Combustível","Transporte","Vestuário","Eletrônicos","Casa","Saúde","Lazer","Serviços","Outros"];
const CATEGORIAS_ENTRADA = ["Salário","Atendimento","Consulta","Bônus","Freelance","Aluguel","Vendas","Outros"];
function chaveCategoria(s: string): string { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
const MAPA_CATEGORIAS = new Map(CATEGORIAS.map((c) => [chaveCategoria(c), c]));
const MAPA_CATEGORIAS_ENTRADA = new Map(CATEGORIAS_ENTRADA.map((c) => [chaveCategoria(c), c]));
function normalizarCategoria(s: any): string { const t = String(s ?? "").trim(); if (!t) return "Outros"; return MAPA_CATEGORIAS.get(chaveCategoria(t)) ?? t; }
function normalizarCategoriaEntrada(s: any): string { const t = String(s ?? "").trim(); if (!t) return "Outros"; return MAPA_CATEGORIAS_ENTRADA.get(chaveCategoria(t)) ?? t; }
async function appendRange(token: string, sheetId: string, linhas: (string | number)[][], anchor: string): Promise<any> {
  const range = `${encodeURIComponent(anchor)}:append`;
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ values: linhas }) });
  try { return await r.json(); } catch { return null; }
}
function linhaInicialDoRange(j: any): number | null {
  const after = (j?.updates?.updatedRange ?? "").split("!").pop() ?? "";
  const m = after.match(/[A-Z]+(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
async function appendLinhaAba(token: string, sheetId: string, valores: (string | number)[], anchor: string): Promise<number | null> {
  const j = await appendRange(token, sheetId, [valores], anchor);
  return linhaInicialDoRange(j);
}
async function setCelula(token: string, sheetId: string, aba: string, cell: string, valor: string) {
  const range = `${encodeURIComponent(aba)}!${cell}`;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ values: [[valor]] }) });
}
async function limparLinhaNotas(token: string, sheetId: string, linha: number) {
  const range = encodeURIComponent(`Notas!A${linha}:S${linha}`);
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:clear`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
}
function anoMesKey(iso: string | null): string {
  const d = iso ? new Date(iso + "T12:00:00") : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function limitesMes(chave: string): { ini: string; prox: string } {
  const [y, m] = chave.split("-").map(Number);
  const ini = `${y}-${String(m).padStart(2, "0")}-01`;
  const prox = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { ini, prox };
}
function linhaNotaDeDB(n: any): (string | number)[] {
  return [ n.data_compra ? isoToBR(n.data_compra) : "", n.estabelecimento ?? "", n.endereco ?? "", n.categoria ?? "", n.valor_bruto ?? "", n.valor_desconto ?? "", n.valor_total ?? "", n.forma_pagamento ?? "", n.nf_codigo ?? "", n.valor_icms ?? "", n.valor_pis ?? "", n.valor_cofins ?? "", n.valor_ipi ?? "", n.valor_ii ?? "", n.valor_cbs ?? "", n.valor_ibs ?? "", n.valor_is ?? "", n.valor_tributos ?? "", n.drive_file_id ? `https://drive.google.com/file/d/${n.drive_file_id}/view` : "" ];
}
async function repopularMes(token: string, cliente: any, sheetId: string, dataISO: string | null) {
  const chave = anoMesKey(dataISO);
  const { ini, prox } = limitesMes(chave);
  const notas = await sbSelect(`notas_fiscais?cliente_id=eq.${cliente.id}&data_compra=gte.${ini}&data_compra=lt.${prox}&order=data_compra.asc,criado_em.asc&select=*`);
  if (Array.isArray(notas) && notas.length) {
    const j = await appendRange(token, sheetId, notas.map(linhaNotaDeDB), ANCHOR_NOTAS);
    const start = linhaInicialDoRange(j);
    if (start != null) { for (let i = 0; i < notas.length; i++) { await sbPatch(`notas_fiscais?id=eq.${notas[i].id}`, { sheet_id: sheetId, sheet_linha: start + i }); } }
    const ids = notas.map((n: any) => `\"${n.id}\"`).join(",");
    const itens = await sbSelect(`itens?nf_id=in.(${ids})&select=nf_id,descricao,quantidade,unidade,valor_unitario,valor_total_item,desconto_item,ean,ncm`);
    if (Array.isArray(itens) && itens.length) {
      const byNf = new Map<string, any>(notas.map((n: any) => [n.id, n]));
      const linhas = itens.map((it: any) => { const n = byNf.get(it.nf_id); return [ n?.data_compra ? isoToBR(n.data_compra) : "", n?.nf_codigo ?? "", it.descricao ?? "", n?.categoria ?? "", it.quantidade ?? "", it.unidade ?? "", it.valor_unitario ?? "", it.valor_total_item ?? "", it.desconto_item ?? "", it.ean ?? "", it.ncm ?? "" ]; });
      await appendRange(token, sheetId, linhas, ANCHOR_ITENS);
    }
  }
  const ents = await sbSelect(`entradas?cliente_id=eq.${cliente.id}&data_entrada=gte.${ini}&data_entrada=lt.${prox}&order=data_entrada.asc&select=data_entrada,descricao,categoria,valor`);
  if (Array.isArray(ents) && ents.length) { await appendRange(token, sheetId, ents.map((e: any) => [ e.data_entrada ? isoToBR(e.data_entrada) : "", e.descricao ?? "", e.categoria ?? "Receita de serviços", e.valor ?? "" ]), ANCHOR_ENTRADAS); }
}
async function criarSheetMensal(token: string, cliente: any, dataISO: string | null, pastaMesId: string): Promise<string> {
  const am = anoMes(dataISO);
  const cria = await fetch("https://sheets.googleapis.com/v4/spreadsheets", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ properties: { title: `Notinha ${am.amigavel}`, locale: "pt_BR", timeZone: "America/Sao_Paulo" }, sheets: [{ properties: { title: "Notas" } }, { properties: { title: "Itens" } }, { properties: { title: "Entradas" } }] }) });
  const id = (await cria.json()).spreadsheetId;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: [ { range: "Notas!A1", values: [["","","","","Totais do mês →","=SOMA(F3:F)","=SOMA(G3:G)"]] }, { range: "Notas!A2", values: [HEADER_NOTAS] }, { range: "Itens!A1", values: [HEADER_ITENS] }, { range: "Entradas!A1", values: [["","","Total →","=SOMA(D3:D)"]] }, { range: "Entradas!A2", values: [HEADER_ENTRADAS] } ] }) });
  await moverParaPasta(token, id, pastaMesId);
  await repopularMes(token, cliente, id, dataISO);
  return id;
}
async function getOrCreateSheetMensal(token: string, cliente: any, dataISO: string | null, pastaMesId?: string): Promise<string> {
  await garantirRaiz(token, cliente);
  const pmId = pastaMesId ?? await garantirPastaMes(token, cliente, dataISO);
  const chave = anoMesKey(dataISO);
  const map = await sbSelect(`planilhas_mensais?cliente_id=eq.${cliente.id}&ano_mes=eq.${chave}&select=id,sheet_id`);
  let sheetId: string | null = map?.[0]?.sheet_id ?? null;
  const mapId: string | null = map?.[0]?.id ?? null;
  if (sheetId) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${sheetId}?fields=trashed`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404) sheetId = null;
    else { const j = await r.json().catch(() => ({})); if (j.trashed === true) sheetId = null; }
  }
  if (sheetId) return sheetId;
  sheetId = await criarSheetMensal(token, cliente, dataISO, pmId);
  if (mapId) await sbPatch(`planilhas_mensais?id=eq.${mapId}`, { sheet_id: sheetId });
  else await sbInsert("planilhas_mensais", { cliente_id: cliente.id, ano_mes: chave, sheet_id: sheetId });
  return sheetId;
}
const NF_PROMPT = `Voce le COMPROVANTES DE COMPRA brasileiros: cupom fiscal, NFC-e, NFe, DANFE, recibo, comprovante de cartao, orcamento ou pedido. ACEITE mesmo que diga sem valor fiscal. Devolva APENAS um JSON valido no formato exato: {\"tipo_documento\":\"nfce\",\"data\":\"dd/mm/aaaa\",\"hora\":\"hh:mm:ss\",\"estabelecimento\":\"...\",\"razao_social\":\"...\",\"cnpj\":\"...\",\"inscricao_estadual\":\"...\",\"endereco\":\"...\",\"numero_nf\":\"...\",\"serie\":\"...\",\"chave_acesso\":\"...\",\"valor_bruto\":0.00,\"valor_desconto\":0.00,\"valor_acrescimo\":0.00,\"valor_total\":0.00,\"valor_tributos\":0.00,\"saldo_voucher\":0.00,\"forma_pagamento\":\"...\",\"pagamentos\":[{\"forma\":\"...\",\"valor\":0.00}],\"categoria\":\"...\",\"tef\":{\"aut\":\"...\",\"nsu\":\"...\",\"doc\":\"...\",\"term\":\"...\",\"cartao_final\":\"...\",\"bandeira\":\"...\"},\"tributos\":{\"icms\":0.00,\"pis\":0.00,\"cofins\":0.00,\"ipi\":0.00,\"ii\":0.00,\"cbs\":0.00,\"ibs\":0.00,\"is\":0.00,\"total_aproximado\":0.00},\"itens\":[{\"descricao\":\"...\",\"quantidade\":0,\"unidade\":\"...\",\"valor_unitario\":0.00,\"valor_total\":0.00,\"desconto\":0.00,\"ean\":\"...\",\"ncm\":\"...\"}]}. Regras: tipo_documento nfce para cupom/NFC-e/NFe/DANFE; comprovante_pagamento quando for so comprovante de cartao (TEF/SiTef, NSU/DOC/AUT, sem itens nem chave). tef: extraia aut, nsu, doc, term (TERMINAL), cartao_final (4 ultimos), bandeira; null se nao aparecer, nunca invente. saldo_voucher: saldo disponivel de vale; senao null. pagamentos: se houver mais de uma forma, liste cada uma com valor; trate Credito Loja/Vale/Troca/Gift como forma de pagamento; se uma so, use []. categoria deve ser uma de: Alimentacao, Mercado, Farmacia, Combustivel, Transporte, Vestuario, Eletronicos, Casa, Saude, Lazer, Servicos, Outros. tributos: extraia os totais se aparecerem (icms,pis,cofins,ipi,ii notas modelo 55; cbs,ibs,is reforma 2026; total_aproximado = vTotTrib/Lei 12.741, fracao do total). NUNCA calcule nem estime tributos, e NUNCA use o total como tributo; so o que estiver escrito, senao null. itens: descricao, quantidade, unidade (un/kg/L), valor_unitario, valor_total, desconto, ean (8-14 digitos), ncm; se nao der pra ler, []. ITENS PESADOS (kg/g/L/ml): a linha traz PESO, PRECO POR QUILO/LITRO e VALOR PAGO -> quantidade=peso, valor_unitario=preco por kg/L, valor_total=valor pago; nunca ponha o peso em valor_unitario nem assuma quantidade=1. CONFERENCIA: quantidade x valor_unitario deve bater com valor_total; se nao bater, releia a linha. chave_acesso: 44 digitos ou null. NAO extraia CPF nem nome do consumidor; CNPJ/endereco/razao social sao do ESTABELECIMENTO. Use ponto decimal. Se um campo nao aparecer, null. So devolva {\"erro\":\"nao_e_nota_fiscal\"} se claramente nao for comprovante de compra.`;
function parseJSON(txt: string): any {
  const limpo = txt.replace(/```json/gi, "").replace(/```/g, "").trim();
  const ini = limpo.indexOf("{"); const fim = limpo.lastIndexOf("}");
  if (ini === -1 || fim === -1) throw new Error("sem_json");
  return JSON.parse(limpo.slice(ini, fim + 1));
}
async function viaGemini(b64: string, mime: string): Promise<any> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: NF_PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }], generationConfig: { temperature: 0, response_mime_type: "application/json" } }) });
  if (!r.ok) throw new Error("gemini_" + r.status);
  const j = await r.json();
  return parseJSON(j.candidates[0].content.parts[0].text);
}
async function viaOpenAI(b64: string, mime: string): Promise<any> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content: [ { type: "text", text: NF_PROMPT }, { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } } ] }] }) });
  if (!r.ok) throw new Error("openai_" + r.status);
  const j = await r.json();
  return parseJSON(j.choices[0].message.content);
}
async function viaClaude(b64: string, mime: string): Promise<any> {
  const ehPDF = mime === "application/pdf";
  const midia = ehPDF ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } : { type: "image", source: { type: "base64", media_type: mime, data: b64 } };
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1500, messages: [{ role: "user", content: [ midia, { type: "text", text: NF_PROMPT } ] }] }) });
  if (!r.ok) throw new Error("claude_" + r.status);
  const j = await r.json();
  return parseJSON(j.content[0].text);
}
async function extrairNF(bytes: Uint8Array, mime: string): Promise<{ dados: any; provider: string }> {
  const b64 = encodeBase64(bytes);
  const ehPDF = mime === "application/pdf";
  const tentativas: [string, () => Promise<any>][] = ehPDF ? [["gemini", () => viaGemini(b64, mime)], ["claude", () => viaClaude(b64, mime)]] : [["gemini", () => viaGemini(b64, mime)], ["openai", () => viaOpenAI(b64, mime)], ["claude", () => viaClaude(b64, mime)]];
  for (const [provider, fn] of tentativas) { try { const dados = await fn(); console.log("Extracao OK via", provider); return { dados, provider }; } catch (e) { console.error("Falhou", provider, String(e)); } }
  throw new Error("todas_ias_falharam");
}
function parseValor(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function valOuNull(v: any): number | null { const n = parseValor(v); return n === 0 ? null : n; }
const NUM_EXTENSO: Record<string, number> = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900 };
function valorExtensoDeTokens(tokens: string[]): { valor: number; usados: number } | null {
  let total = 0, atual = 0, achou = false, i = 0;
  for (; i < tokens.length; i++) {
    const w = tokens[i];
    if (w === "e" && achou) continue;
    if (w in NUM_EXTENSO) { atual += NUM_EXTENSO[w]; achou = true; }
    else if (w === "mil") { atual = (atual === 0 ? 1 : atual) * 1000; total += atual; atual = 0; achou = true; }
    else if (w === "milhao" || w === "milhoes") { atual = (atual === 0 ? 1 : atual) * 1000000; total += atual; atual = 0; achou = true; }
    else break;
  }
  if (!achou) return null;
  return { valor: total + atual, usados: i };
}
function parseValorTexto(texto: string): { valor: number; resto: string } | null {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const md = t.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(?:\s*(milhoes|milhao|mil|mi|bi)\b)?/);
  if (md && md.index != null) {
    let n = parseValor(md[1]);
    const mult = md[2];
    if (mult === "mil") n *= 1000;
    else if (mult === "milhao" || mult === "milhoes" || mult === "mi") n *= 1000000;
    else if (mult === "bi") n *= 1000000000;
    if (n > 0) { const resto = (texto.slice(0, md.index) + " " + texto.slice(md.index + md[0].length)).replace(/\s+/g, " ").trim(); return { valor: n, resto }; }
  }
  const tk = t.split(/\s+/);
  for (let s = 0; s < tk.length; s++) {
    if (tk[s] in NUM_EXTENSO || tk[s] === "mil" || tk[s] === "milhao" || tk[s] === "milhoes") {
      const sub = valorExtensoDeTokens(tk.slice(s));
      if (sub && sub.valor > 0) { const orig = texto.split(/\s+/); const resto = [...orig.slice(0, s), ...orig.slice(s + sub.usados)].join(" ").replace(/\s+/g, " ").trim(); return { valor: sub.valor, resto }; }
    }
  }
  return null;
}
function dataBRtoISO(s: any): string | null { if (!s || typeof s !== "string") return null; const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; }
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
function anoMes(iso: string | null): { ano: string; mes: string; label: string; amigavel: string } {
  const d = iso ? new Date(iso + "T12:00:00") : new Date();
  const ano = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const mes = `${mm}_${MESES[d.getMonth()]}`;
  return { ano, mes, label: `${ano} / ${mes}`, amigavel: `${MESES[d.getMonth()]}/${ano}` };
}
function isoToBR(iso: string): string { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; }
const MESNOME: Record<string, number> = { jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6, jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12 };
function parsePeriodoResumo(resto: string): string | null {
  const s = resto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!s) return null;
  let mes: number | null = null, ano: number | null = null;
  let m = s.match(/\b(\d{1,2})[\/\-](\d{4})\b/);
  if (m) { mes = +m[1]; ano = +m[2]; }
  if (!m) { m = s.match(/\b(\d{4})[\/\-](\d{1,2})\b/); if (m) { ano = +m[1]; mes = +m[2]; } }
  if (mes == null) { for (const nome of Object.keys(MESNOME)) { if (new RegExp(`\\b${nome}\\b`).test(s)) { mes = MESNOME[nome]; break; } } const my = s.match(/\b(\d{4})\b/); if (my) ano = +my[1]; }
  if (mes == null) { const mn = s.match(/\b(\d{1,2})\b/); if (mn && +mn[1] >= 1 && +mn[1] <= 12) mes = +mn[1]; }
  if (mes == null || mes < 1 || mes > 12) return null;
  if (ano == null) ano = new Date().getFullYear();
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}
function nowSP(): { iso: string; data: string; hora: string } {
  const s = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
  const [d, t] = s.split(" ");
  return { iso: d, data: d.replace(/-/g, ""), hora: (t ?? "00:00:00").replace(/:/g, "") };
}
function soDigitos(s: any): string { return String(s ?? "").replace(/\D/g, ""); }
function brl(n: any): string { return "R$ " + Number(n ?? 0).toFixed(2).replace(".", ","); }
function validarChave(s: any): string | null { const d = soDigitos(s); return d.length === 44 ? d : null; }
function validarEAN(s: any): string | null { const d = soDigitos(s); return (d.length >= 8 && d.length <= 14) ? d : null; }
function extDe(mime: string): string { return mime === "application/pdf" ? "pdf" : "jpg"; }
function linhasItens(itens: any[], dataBR: string, nfCodigo: string, categoria: string): (string | number)[][] {
  return itens.map((it: any) => [ dataBR, nfCodigo, it.descricao ?? "", categoria, parseValor(it.quantidade) || "", it.unidade ?? "", parseValor(it.valor_unitario) || "", parseValor(it.valor_total) || parseValor(it.valor_unitario) || "", parseValor(it.desconto) || "", validarEAN(it.ean) ?? "", it.ncm ? (soDigitos(it.ncm) || "") : "" ]);
}
function normTef(s: any): string | null { const d = soDigitos(s).replace(/^0+/, ""); return d ? d : null; }
function horaParaMin(h: any): number | null { if (!h) return null; const m = String(h).match(/(\d{1,2}):(\d{2})/); if (!m) return null; return parseInt(m[1], 10) * 60 + parseInt(m[2], 10); }
function dentroDaJanela(h1: any, h2: any, min: number): boolean { const a = horaParaMin(h1), b = horaParaMin(h2); if (a == null || b == null) return true; return Math.abs(a - b) <= min; }
async function acharNotaPorPagamento(clienteId: string, p: any): Promise<any | null> {
  if (p.tefAut) { const r = await sbSelect(`notas_fiscais?cliente_id=eq.${clienteId}&tef_aut=eq.${p.tefAut}&order=criado_em.desc&limit=1&select=*`); if (r?.[0]) return r[0]; }
  for (const k of [p.tefNsu, p.tefDoc]) { if (k) { const r = await sbSelect(`notas_fiscais?cliente_id=eq.${clienteId}&or=(tef_nsu.eq.${k},tef_doc.eq.${k})&order=criado_em.desc&limit=1&select=*`); if (r?.[0]) return r[0]; } }
  if (p.cnpj && p.valor != null && p.dataISO) { const r = await sbSelect(`notas_fiscais?cliente_id=eq.${clienteId}&cnpj_estabelecimento=eq.${p.cnpj}&valor_total=eq.${p.valor}&data_compra=eq.${p.dataISO}&select=*`); if (Array.isArray(r) && r.length) return r.find((n: any) => dentroDaJanela(n.hora_compra, p.hora, 10)) ?? r[0]; }
  return null;
}
async function acharPagamentoPendente(clienteId: string, p: any): Promise<any | null> {
  if (p.tefAut) { const r = await sbSelect(`pagamentos_pendentes?cliente_id=eq.${clienteId}&tef_aut=eq.${p.tefAut}&order=criado_em.desc&limit=1&select=*`); if (r?.[0]) return r[0]; }
  for (const k of [p.tefNsu, p.tefDoc]) { if (k) { const r = await sbSelect(`pagamentos_pendentes?cliente_id=eq.${clienteId}&or=(tef_nsu.eq.${k},tef_doc.eq.${k})&order=criado_em.desc&limit=1&select=*`); if (r?.[0]) return r[0]; } }
  if (p.cnpj && p.valor != null && p.dataISO) { const r = await sbSelect(`pagamentos_pendentes?cliente_id=eq.${clienteId}&cnpj=eq.${p.cnpj}&valor=eq.${p.valor}&data_compra=eq.${p.dataISO}&select=*`); if (Array.isArray(r) && r.length) return r.find((x: any) => dentroDaJanela(x.hora_compra, p.hora, 10)) ?? r[0]; }
  return null;
}
async function anexarPagamentoNaNota(token: string, nota: any, p: any) {
  const patch: any = {};
  if (p.forma_pagamento && !nota.forma_pagamento) patch.forma_pagamento = p.forma_pagamento;
  if (p.cartao_final && !nota.cartao_final) patch.cartao_final = p.cartao_final;
  if (p.cartao_bandeira && !nota.cartao_bandeira) patch.cartao_bandeira = p.cartao_bandeira;
  if (p.tef_aut && !nota.tef_aut) patch.tef_aut = p.tef_aut;
  if (p.tef_nsu && !nota.tef_nsu) patch.tef_nsu = p.tef_nsu;
  if (p.tef_doc && !nota.tef_doc) patch.tef_doc = p.tef_doc;
  if (p.terminal && !nota.terminal) patch.terminal = p.terminal;
  if (p.saldo_voucher != null && nota.saldo_voucher == null) patch.saldo_voucher = p.saldo_voucher;
  if (Object.keys(patch).length) await sbPatch(`notas_fiscais?id=eq.${nota.id}`, patch);
  if (patch.forma_pagamento && nota.sheet_id && nota.sheet_linha) { try { await setCelula(token, nota.sheet_id, "Notas", `H${nota.sheet_linha}`, patch.forma_pagamento); } catch (_) { } }
}
async function registrarComprovanteComoGasto(cliente: any, phoneNumberId: string, from: string, pend: any) {
  if (!cliente.drive_refresh_token) { await enviarWhats(phoneNumberId, from, "Sua conta ainda nao esta conectada ao Google Drive. Finalize o cadastro em usenotinha.com.br."); return; }
  const token = await googleAccessToken(cliente.drive_refresh_token);
  const dataISO = pend.data_compra ?? nowSP().iso;
  const valor = parseValor(pend.valor);
  const estab = pend.estabelecimento || "—";
  const am = anoMes(dataISO);
  const nfCodigo = await gerarNfCodigo(cliente.id, dataISO);
  const sheetId = await getOrCreateSheetMensal(token, cliente, dataISO);
  const linkImg = pend.drive_file_id ? `https://drive.google.com/file/d/${pend.drive_file_id}/view` : "";
  const sheetLinha = await appendLinhaAba(token, sheetId, [ isoToBR(dataISO), estab, "", "Outros", valor, 0, valor, pend.forma_pagamento ?? "", nfCodigo, "", "", "", "", "", "", "", "", "", linkImg ], ANCHOR_NOTAS);
  const notaRow = await sbInsert("notas_fiscais", { cliente_id: cliente.id, nf_codigo: nfCodigo, data_compra: dataISO, estabelecimento: estab, valor_bruto: valor, valor_total: valor, categoria: "Outros", cnpj_estabelecimento: pend.cnpj ?? null, hora_compra: pend.hora_compra ?? null, forma_pagamento: pend.forma_pagamento ?? null, cartao_final: pend.cartao_final ?? null, cartao_bandeira: pend.cartao_bandeira ?? null, tef_aut: pend.tef_aut ?? null, tef_nsu: pend.tef_nsu ?? null, tef_doc: pend.tef_doc ?? null, terminal: pend.terminal ?? null, saldo_voucher: pend.saldo_voucher ?? null, tipo_documento: "comprovante_pagamento", provider: "comprovante", drive_file_id: pend.drive_file_id ?? null, drive_pasta_id: pend.drive_pasta_id ?? null, sheet_id: sheetId, sheet_linha: sheetLinha });
  await sbDelete(`pagamentos_pendentes?id=eq.${pend.id}`);
  const linhaDataHora = pend.hora_compra ? `📅 ${isoToBR(dataISO)} às ${String(pend.hora_compra).slice(0, 5)}` : `📅 ${isoToBR(dataISO)}`;
  const wamComp = await enviarWhats(phoneNumberId, from, [ "✅ Gasto registrado!", `🏪 ${estab}`, linhaDataHora, `💰 ${brl(valor)}`, "🏷️ Outros", "", `📊 Planilha de ${am.amigavel}:`, `https://docs.google.com/spreadsheets/d/${sheetId}/edit`, ...(linkImg ? ["", `📎 Comprovante: ${linkImg}`] : []) ].join("\n"));
  if (wamComp && notaRow?.id) await sbPatch(`notas_fiscais?id=eq.${notaRow.id}`, { wam_id: wamComp });
  if (notaRow?.id) await mostrarMenuPos(cliente, phoneNumberId, from, { k: "nota", id: notaRow.id, est: estab, val: valor });
}
async function tratarRespostaComprovante(cliente: any, phoneNumberId: string, from: string, texto: string): Promise<"registrado" | "ignore"> {
  const tl = texto.trim().toLowerCase();
  const quer = /^\s*2\s*$/.test(tl) || /registrar mesmo assim/.test(tl) || /^n[ãa]o,?\s*registrar/.test(tl);
  if (!quer) return "ignore";
  const pend = (await sbSelect(`pagamentos_pendentes?id=eq.${cliente.aguardando_comprovante_pend}&select=*`))?.[0];
  if (!pend) { await enviarWhats(phoneNumberId, from, "Nao achei o comprovante pra registrar. 🙂"); return "registrado"; }
  await registrarComprovanteComoGasto(cliente, phoneNumberId, from, pend);
  return "registrado";
}
function acessoBloqueado(cliente: any): boolean { const st = String(cliente.pagamento_status ?? "").toLowerCase(); return !["ativo", "cortesia"].includes(st); }
async function enviarBloqueio(phoneNumberId: string, from: string) { await enviarWhats(phoneNumberId, from, "⏸️ Sua assinatura esta pausada ou vencida. Pra reativar, acesse usenotinha.com.br. Seus dados continuam guardados. 🙂"); }
async function ultimaNota(clienteId: string): Promise<any | null> { const r = await sbSelect(`notas_fiscais?cliente_id=eq.${clienteId}&sheet_linha=not.is.null&order=criado_em.desc&limit=1&select=id,sheet_id,sheet_linha,estabelecimento,valor_total,nf_codigo`); return r?.[0] ?? null; }
async function avisarPendente(_cliente: any, phoneNumberId: string, from: string) { await enviarWhats(phoneNumberId, from, "📌 Tem uma nota aqui esperando a *data*. Me informa a data dela (ex: *12/05/2026*) ou manda *pular*. 🙂"); }
async function perguntarResync(cliente: any, phoneNumberId: string, from: string) {
  await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_resync: true });
  await enviarWhats(phoneNumberId, from, [ "🔎 Opa! Sua pasta *Notinha* nao estava mais no Google Drive — parece que foi apagada.", "", "Ja recriei a pasta e registrei a nota que voce mandou.", "", "Quer que eu *ressincronize o resto* (todos os meses) com os seus dados?", "", "Responde *SIM* que eu reconstruo. 🙂" ].join("\n"));
}
async function ressincronizar(cliente: any, phoneNumberId: string, from: string) {
  if (!cliente.drive_refresh_token) { await enviarWhats(phoneNumberId, from, "Sua conta nao esta conectada ao Google Drive. Reconecte em usenotinha.com.br."); return; }
  const token = await googleAccessToken(cliente.drive_refresh_token);
  await garantirRaiz(token, cliente);
  const meses = new Set<string>();
  const notas = await sbSelect(`notas_fiscais?cliente_id=eq.${cliente.id}&data_compra=not.is.null&select=data_compra`);
  (notas || []).forEach((n: any) => meses.add(anoMesKey(n.data_compra)));
  const ents = await sbSelect(`entradas?cliente_id=eq.${cliente.id}&data_entrada=not.is.null&select=data_entrada`);
  (ents || []).forEach((e: any) => meses.add(anoMesKey(e.data_entrada)));
  let n = 0;
  for (const chave of meses) { await getOrCreateSheetMensal(token, cliente, `${chave}-01`); n++; }
  await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_resync: false });
  if (n === 0) { await enviarWhats(phoneNumberId, from, "✅ Tudo certo! Nao havia outros meses pra reconstruir."); return; }
  await enviarWhats(phoneNumberId, from, `✅ Pronto! Reconstrui ${n} ${n === 1 ? "mes" : "meses"} a partir dos seus dados.`);
}
async function aprenderCategoria(clienteId: string, cnpj: string | null, estab: string, categoria: string) {
  if (!categoria) return;
  categoria = normalizarCategoria(categoria);
  const en = normEstab(estab);
  if (!cnpj && !en) return;
  const filtro = cnpj ? `cliente_id=eq.${clienteId}&cnpj=eq.${cnpj}` : `cliente_id=eq.${clienteId}&estabelecimento=eq.${encodeURIComponent(en)}`;
  const achados = await sbSelect(`categorias_aprendidas?${filtro}&select=id,vezes_usada&limit=1`);
  if (achados?.[0]?.id) { await sbPatch(`categorias_aprendidas?id=eq.${achados[0].id}`, { categoria, vezes_usada: (achados[0].vezes_usada ?? 1) + 1, ultima_vez: new Date().toISOString() }); }
  else { await sbInsert("categorias_aprendidas", { cliente_id: clienteId, cnpj: cnpj ?? null, estabelecimento: en, categoria, vezes_usada: 1, ultima_vez: new Date().toISOString() }); }
}
function normEstab(s: any): string { return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\b(LTDA|EIRELI|EPP|ME|S\/?A|SA|MEI)\b/g, " ").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
async function buscarCategoriaAprendida(clienteId: string, cnpj: string | null, estab: string): Promise<string | null> {
  if (cnpj) { const r = await sbSelect(`categorias_aprendidas?cliente_id=eq.${clienteId}&cnpj=eq.${cnpj}&select=categoria&limit=1`); if (r?.[0]?.categoria) return r[0].categoria; }
  const en = normEstab(estab);
  if (en) { const r = await sbSelect(`categorias_aprendidas?cliente_id=eq.${clienteId}&estabelecimento=eq.${encodeURIComponent(en)}&select=categoria&limit=1`); if (r?.[0]?.categoria) return r[0].categoria; }
  return null;
}
async function tratarEscolhaCategoria(cliente: any, phoneNumberId: string, from: string, texto: string): Promise<"applied" | "ignore"> {
  const t = texto.trim();
  const tl = t.toLowerCase();
  if (/^(resumo|relat|pdf|insights?|menu|op[çc]|ajuda|suporte|planilha|top|buscar|maiores|pre[çc]o|apagar|excluir|deletar|corrigir|corrige|ajustar|mudar|ress?incr|reconstru|gastei|recebi|ativar)/.test(tl)) return "ignore";
  const nota = (await sbSelect(`notas_fiscais?id=eq.${cliente.aguardando_categoria_nf}&select=id,sheet_id,sheet_linha,estabelecimento,cnpj_estabelecimento,categoria`))?.[0];
  if (/^(ok|manter|mant[eé]m|t[aá] bom|isso|deixa|pode deixar|t[aá])\b/.test(tl)) {
    if (nota) await aprenderCategoria(cliente.id, nota.cnpj_estabelecimento ?? null, nota.estabelecimento ?? "", nota.categoria ?? "Outros");
    await enviarWhats(phoneNumberId, from, "👍 Categoria mantida.");
    return "applied";
  }
  let nova: string | null = null;
  if (/^\d+$/.test(tl)) { const i = parseInt(tl, 10); if (i >= 1 && i <= CATEGORIAS.length) nova = CATEGORIAS[i - 1]; }
  if (!nova) nova = t.slice(0, 40);
  if (!nova) return "ignore";
  nova = normalizarCategoria(nova);
  if (!nota) { await enviarWhats(phoneNumberId, from, "Nao achei a nota pra mudar a categoria. 🙂"); return "applied"; }
  await sbPatch(`notas_fiscais?id=eq.${nota.id}`, { categoria: nova });
  if (cliente.drive_refresh_token && nota.sheet_id && nota.sheet_linha) { try { const token = await googleAccessToken(cliente.drive_refresh_token); await setCelula(token, nota.sheet_id, "Notas", `D${nota.sheet_linha}`, nova); } catch (_) { } }
  await aprenderCategoria(cliente.id, nota.cnpj_estabelecimento ?? null, nota.estabelecimento ?? "", nova);
  await enviarWhats(phoneNumberId, from, `🏷️ Categoria atualizada para *${nova}*.`);
  return "applied";
}
async function processarNota(cliente: any, phoneNumberId: string, from: string, mediaId: string, wamCliente: string | null = null) {
  if (acessoBloqueado(cliente)) { await enviarBloqueio(phoneNumberId, from); return; }
  if (!cliente.drive_refresh_token) { await enviarWhats(phoneNumberId, from, "Sua conta ainda nao esta conectada ao Google Drive. Finalize o cadastro em usenotinha.com.br."); return; }
  if (cliente.aguardando_data_nf) { await avisarPendente(cliente, phoneNumberId, from); return; }
  const { bytes, mime } = await baixarImagem(mediaId);
  let extra;
  try { extra = await extrairNF(bytes, mime); } catch { await enviarWhats(phoneNumberId, from, "Tive dificuldade pra ler essa nota. Tenta de novo com o comprovante inteiro e bem iluminado."); return; }
  if (extra.dados?.erro === "nao_e_nota_fiscal") { await enviarWhats(phoneNumberId, from, "Nao consegui identificar um comprovante de compra. Manda a foto/PDF do cupom ou recibo inteiro, por favor."); return; }
  const d = extra.dados;
  const dataISO = dataBRtoISO(d.data);
  let valorTotal = parseValor(d.valor_total);
  const valorBruto = parseValor(d.valor_bruto) || valorTotal;
  let valorDesc = parseValor(d.valor_desconto);
  let categoria = normalizarCategoria(d.categoria || "Outros");
  const estab = d.estabelecimento || "—";
  const endereco = d.endereco || null;
  let pagamento = d.forma_pagamento || null;
  const acrescimo = valOuNull(d.valor_acrescimo);
  const cnpjEstab = soDigitos(d.cnpj) || null;
  const razaoSocial = d.razao_social ? String(d.razao_social).trim() : null;
  const ie = d.inscricao_estadual ? String(d.inscricao_estadual).trim() : null;
  const horaCompra = d.hora ? String(d.hora).trim() : null;
  const numeroNf = d.numero_nf ? String(d.numero_nf).trim() : null;
  const serieNf = d.serie ? String(d.serie).trim() : null;
  const chaveAcesso = validarChave(d.chave_acesso);
  const pagamentosArr = Array.isArray(d.pagamentos) ? d.pagamentos : [];
  if (pagamentosArr.length) {
    const ehCreditoLoja = (s: any) => /cr[eé]dito\s*loja|vale|troca|gift/i.test(String(s ?? ""));
    let creditoLoja = 0; const outras: string[] = [];
    for (const pg of pagamentosArr) { const v = parseValor(pg?.valor); if (ehCreditoLoja(pg?.forma)) creditoLoja += v; else if (pg?.forma) outras.push(String(pg.forma).trim()); }
    if (creditoLoja > 0) { valorDesc = (valorDesc || 0) + creditoLoja; valorTotal = Math.max(0, valorTotal - creditoLoja); if (outras.length) pagamento = outras.join(", "); }
  }
  const tipoDoc = d.tipo_documento ? String(d.tipo_documento).toLowerCase() : "";
  const tef = d.tef || {};
  const tefAut = normTef(tef.aut);
  const tefNsu = normTef(tef.nsu);
  const tefDoc = normTef(tef.doc);
  const terminal = tef.term ? String(tef.term).trim().slice(0, 30) : null;
  const saldoVoucher = valOuNull(d.saldo_voucher);
  const cartaoFinal = tef.cartao_final ? (soDigitos(tef.cartao_final).slice(-4) || null) : null;
  const cartaoBandeira = tef.bandeira ? String(tef.bandeira).trim().slice(0, 20) : null;
  const itensArr = Array.isArray(d.itens) ? d.itens : [];
  const token = await googleAccessToken(cliente.drive_refresh_token);
  const raiz = await garantirRaiz(token, cliente);
  const sp = nowSP();
  const estabSlug = estab.replace(/[^\w]/g, "_").slice(0, 30);
  const ext = extDe(mime);
  if (chaveAcesso) {
    const dup = await sbSelect(`notas_fiscais?cliente_id=eq.${cliente.id}&chave_acesso=eq.${chaveAcesso}&select=id,data_compra,drive_pasta_id,estabelecimento,nf_codigo,categoria,valor_tributos,sheet_id,sheet_linha`);
    if (Array.isArray(dup) && dup.length > 0) {
      const nota = dup[0];
      const dISO = nota.data_compra ?? dataISO ?? sp.iso;
      const mesId = await garantirPastaMes(token, cliente, dISO);
      const sheetIdDup = nota.sheet_id ?? await getOrCreateSheetMensal(token, cliente, dISO, mesId);
      const fileId = await subirImagem(token, mesId, `${dISO.replace(/-/g, "")}_${sp.hora}_${estabSlug}.${ext}`, bytes, mime);
      const tribDup = d.tributos || {};
      let vTribDup = valOuNull(tribDup.total_aproximado) ?? valOuNull(d.valor_tributos);
      if (vTribDup != null && valorTotal > 0 && Math.abs(vTribDup - valorTotal) < 0.01) vTribDup = null;
      const patchDup: any = { drive_file_id: fileId, drive_pasta_id: mesId };
      if (nota.valor_tributos == null && vTribDup != null) patchDup.valor_tributos = vTribDup;
      await sbPatch(`notas_fiscais?id=eq.${nota.id}`, patchDup);
      if (patchDup.valor_tributos != null && nota.sheet_id && nota.sheet_linha) { try { await setCelula(token, nota.sheet_id, "Notas", `R${nota.sheet_linha}`, String(patchDup.valor_tributos)); } catch (_) { } }
      let juntados = 0;
      if (itensArr.length && nota.id) {
        const jaTem = await sbSelect(`itens?nf_id=eq.${nota.id}&select=descricao`);
        const setDesc = new Set((jaTem || []).map((x: any) => String(x.descricao ?? "").toLowerCase().trim()));
        const novos = itensArr.filter((it: any) => { const dd = String(it.descricao ?? "").toLowerCase().trim(); return dd && !setDesc.has(dd); });
        if (novos.length) {
          const novosSb = novos.map((it: any) => ({ descricao: it.descricao ?? "", quantidade: valOuNull(it.quantidade), valor_unitario: valOuNull(it.valor_unitario), valor_total_item: valOuNull(it.valor_total) ?? valOuNull(it.valor_unitario), desconto_item: valOuNull(it.desconto), unidade: it.unidade ? String(it.unidade).trim().slice(0, 10) : null, ncm: it.ncm ? (soDigitos(it.ncm) || null) : null, ean: validarEAN(it.ean) }));
          await sbInsert("itens", novosSb.map((i) => ({ ...i, nf_id: nota.id })));
          await appendRange(token, sheetIdDup, linhasItens(novos, nota.data_compra ? isoToBR(nota.data_compra) : (d.data || ""), nota.nf_codigo ?? "", nota.categoria ?? ""), ANCHOR_ITENS);
          juntados = novos.length;
        }
      }
      const extraMsg = juntados ? ` Juntei ${juntados} ${juntados === 1 ? "item" : "itens"} desta pagina.` : "";
      await enviarWhats(phoneNumberId, from, `✅ Essa e a mesma nota (${nota.estabelecimento ?? "—"}).${extraMsg} Atualizei sem duplicar. 🙂`);
      if (raiz.recriada) await perguntarResync(cliente, phoneNumberId, from);
      return;
    }
  }
  const ehComprovante = tipoDoc === "comprovante_pagamento" || (!chaveAcesso && itensArr.length === 0 && (tefAut || tefNsu || tefDoc) && valorTotal > 0);
  if (ehComprovante) {
    const dISO = dataISO ?? sp.iso;
    const notaMatch = await acharNotaPorPagamento(cliente.id, { tefAut, tefNsu, tefDoc, cnpj: cnpjEstab, valor: valorTotal || null, dataISO, hora: horaCompra });
    if (notaMatch) {
      const mesId = await garantirPastaMes(token, cliente, notaMatch.data_compra ?? dISO);
      await subirImagem(token, mesId, `${(notaMatch.data_compra ?? dISO).replace(/-/g, "")}_${sp.hora}_COMPROVANTE.${ext}`, bytes, mime);
      await anexarPagamentoNaNota(token, notaMatch, { forma_pagamento: pagamento, cartao_final: cartaoFinal, cartao_bandeira: cartaoBandeira, tef_aut: tefAut, tef_nsu: tefNsu, tef_doc: tefDoc, terminal, saldo_voucher: saldoVoucher });
      await enviarWhats(phoneNumberId, from, `🔗 Esse e o *comprovante de pagamento* da nota de ${notaMatch.estabelecimento ?? "—"} (${brl(notaMatch.valor_total)}) que voce ja registrou. Vinculei — *nao vou contar de novo*. 🙂`);
      if (raiz.recriada) await perguntarResync(cliente, phoneNumberId, from);
      return;
    }
    const mesId = await garantirPastaMes(token, cliente, dISO);
    const fileId = await subirImagem(token, mesId, `${dISO.replace(/-/g, "")}_${sp.hora}_COMPROVANTE.${ext}`, bytes, mime);
    const pend = await sbInsert("pagamentos_pendentes", { cliente_id: cliente.id, valor: valorTotal || null, cnpj: cnpjEstab, estabelecimento: estab, data_compra: dataISO, hora_compra: horaCompra, forma_pagamento: pagamento, cartao_final: cartaoFinal, cartao_bandeira: cartaoBandeira, tef_aut: tefAut, tef_nsu: tefNsu, tef_doc: tefDoc, terminal, saldo_voucher: saldoVoucher, drive_file_id: fileId, drive_pasta_id: mesId });
    if (pend?.id) await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_comprovante_pend: pend.id });
    await enviarWhats(phoneNumberId, from, `🧾 Recebi o *comprovante de pagamento*${estab && estab !== "—" ? " da " + estab : ""} (${brl(valorTotal)}).\n\nSe tem *nota fiscal*, manda a foto ou PDF dela que eu junto tudo. Se *nao tem nota*, digite *2* que eu registro como gasto. 🙂`);
    if (raiz.recriada) await perguntarResync(cliente, phoneNumberId, from);
    return;
  }
  const trib = d.tributos || {};
  const vIcms = valOuNull(trib.icms), vPis = valOuNull(trib.pis), vCofins = valOuNull(trib.cofins);
  const vIpi = valOuNull(trib.ipi), vIi = valOuNull(trib.ii), vCbs = valOuNull(trib.cbs);
  const vIbs = valOuNull(trib.ibs), vIs = valOuNull(trib.is);
  let vTrib = valOuNull(trib.total_aproximado) ?? valOuNull(d.valor_tributos);
  if (vTrib != null && ((valorTotal > 0 && Math.abs(vTrib - valorTotal) < 0.01) || (valorBruto > 0 && Math.abs(vTrib - valorBruto) < 0.01))) vTrib = null;
  const itens = itensArr;
  const itensSb = itens.map((it: any) => ({ descricao: it.descricao ?? "", quantidade: valOuNull(it.quantidade), valor_unitario: valOuNull(it.valor_unitario), valor_total_item: valOuNull(it.valor_total) ?? valOuNull(it.valor_unitario), desconto_item: valOuNull(it.desconto), unidade: it.unidade ? String(it.unidade).trim().slice(0, 10) : null, ncm: it.ncm ? (soDigitos(it.ncm) || null) : null, ean: validarEAN(it.ean) }));
  const camposTef = { tipo_documento: "nfce", tef_aut: tefAut, tef_nsu: tefNsu, tef_doc: tefDoc, cartao_final: cartaoFinal, cartao_bandeira: cartaoBandeira, terminal, saldo_voucher: saldoVoucher };
  if (!dataISO) {
    const pastaPend = await garantirPasta(token, cliente.id, "_Pendentes", "_Pendentes", cliente.drive_folder_id);
    const fileId = await subirImagem(token, pastaPend, `${sp.data}_${sp.hora}_${estabSlug}.${ext}`, bytes, mime);
    const nfCodigo = await gerarNfCodigo(cliente.id, sp.iso);
    const notaRow = await sbInsert("notas_fiscais", { cliente_id: cliente.id, nf_codigo: nfCodigo, data_compra: null, estabelecimento: estab, endereco, valor_bruto: valorBruto, valor_desconto: valorDesc, valor_acrescimo: acrescimo, valor_total: valorTotal, valor_tributos: vTrib, valor_icms: vIcms, valor_pis: vPis, valor_cofins: vCofins, valor_ipi: vIpi, valor_ii: vIi, valor_cbs: vCbs, valor_ibs: vIbs, valor_is: vIs, forma_pagamento: pagamento, categoria, cnpj_estabelecimento: cnpjEstab, razao_social: razaoSocial, inscricao_estadual: ie, hora_compra: horaCompra, numero_nf: numeroNf, serie_nf: serieNf, chave_acesso: chaveAcesso, drive_file_id: fileId, drive_pasta_id: pastaPend, provider: extra.provider, wam_id_cliente: wamCliente, ...camposTef });
    if (itensSb.length && notaRow?.id) await sbInsert("itens", itensSb.map((i) => ({ ...i, nf_id: notaRow.id })));
    await sbPatch(`clientes?id=eq.${cliente.id}`, { ultima_atividade: new Date().toISOString(), aguardando_data_nf: notaRow?.id ?? null });
    const wamPend = await enviarWhats(phoneNumberId, from, `🧾 ${estab} — ${brl(valorTotal)}\n\n⚠️ Nao consegui ler a *data* dessa nota. Manda assim: *12/05/2026 14:30* (ou so a data).`);
    if (wamPend && notaRow?.id) await sbPatch(`notas_fiscais?id=eq.${notaRow.id}`, { wam_id: wamPend });
    if (raiz.recriada) await perguntarResync(cliente, phoneNumberId, from);
    return;
  }
  const aprendida = await buscarCategoriaAprendida(cliente.id, cnpjEstab, estab);
  if (aprendida) categoria = aprendida;
  const am = anoMes(dataISO);
  const pastaMes = await garantirPastaMes(token, cliente, dataISO);
  const dataCompacta = dataISO.replace(/-/g, "");
  const nfCodigo = await gerarNfCodigo(cliente.id, dataISO);
  const fileId = await subirImagem(token, pastaMes, `${dataCompacta}_${sp.hora}_${estabSlug}.${ext}`, bytes, mime);
  const linkImg = `https://drive.google.com/file/d/${fileId}/view`;
  const sheetId = await getOrCreateSheetMensal(token, cliente, dataISO, pastaMes);
  const sheetLinha = await appendLinhaAba(token, sheetId, [ d.data || isoToBR(dataISO), estab, endereco || "", categoria, valorBruto, valorDesc, valorTotal, pagamento || "", nfCodigo, vIcms ?? "", vPis ?? "", vCofins ?? "", vIpi ?? "", vIi ?? "", vCbs ?? "", vIbs ?? "", vIs ?? "", vTrib ?? "", linkImg ], ANCHOR_NOTAS);
  const notaRow = await sbInsert("notas_fiscais", { cliente_id: cliente.id, nf_codigo: nfCodigo, data_compra: dataISO, estabelecimento: estab, endereco, valor_bruto: valorBruto, valor_desconto: valorDesc, valor_acrescimo: acrescimo, valor_total: valorTotal, valor_tributos: vTrib, valor_icms: vIcms, valor_pis: vPis, valor_cofins: vCofins, valor_ipi: vIpi, valor_ii: vIi, valor_cbs: vCbs, valor_ibs: vIbs, valor_is: vIs, forma_pagamento: pagamento, categoria, cnpj_estabelecimento: cnpjEstab, razao_social: razaoSocial, inscricao_estadual: ie, hora_compra: horaCompra, numero_nf: numeroNf, serie_nf: serieNf, chave_acesso: chaveAcesso, drive_file_id: fileId, drive_pasta_id: pastaMes, sheet_id: sheetId, sheet_linha: sheetLinha, provider: extra.provider, wam_id_cliente: wamCliente, ...camposTef });
  if (itensSb.length && notaRow?.id) { await sbInsert("itens", itensSb.map((i) => ({ ...i, nf_id: notaRow.id }))); await appendRange(token, sheetId, linhasItens(itens, d.data || isoToBR(dataISO), nfCodigo, categoria), ANCHOR_ITENS); }
  await sbPatch(`clientes?id=eq.${cliente.id}`, { ultima_atividade: new Date().toISOString(), aguardando_data_nf: null });
  const horaShow = horaCompra ? String(horaCompra).slice(0, 5) : null;
  const dataBRshow = d.data || isoToBR(dataISO);
  const linhaDataHora = horaShow ? `📅 ${dataBRshow} às ${horaShow}` : `📅 ${dataBRshow}`;
  const linhasConfirm = [ "✅ Nota registrada!", `🏪 ${estab}`, linhaDataHora, `💰 ${brl(valorTotal)}`, `🏷️ ${categoria}`, "", `📊 Planilha de ${am.amigavel}:`, `https://docs.google.com/spreadsheets/d/${sheetId}/edit`, "", "_Categoria errada? Use \"Responder\" nesta mensagem (ou na foto da nota) e escreva a categoria certa._" ];
  const wamConfirm = await enviarWhats(phoneNumberId, from, linhasConfirm.join("\n"));
  if (wamConfirm && notaRow?.id) await sbPatch(`notas_fiscais?id=eq.${notaRow.id}`, { wam_id: wamConfirm });
  if (notaRow?.id) {
    const pag = await acharPagamentoPendente(cliente.id, { tefAut, tefNsu, tefDoc, cnpj: cnpjEstab, valor: valorTotal || null, dataISO, hora: horaCompra });
    if (pag) { await anexarPagamentoNaNota(token, { ...notaRow, sheet_id: sheetId, sheet_linha: sheetLinha }, { forma_pagamento: pag.forma_pagamento, cartao_final: pag.cartao_final, cartao_bandeira: pag.cartao_bandeira, tef_aut: pag.tef_aut, tef_nsu: pag.tef_nsu, tef_doc: pag.tef_doc, terminal: pag.terminal, saldo_voucher: pag.saldo_voucher }); await sbDelete(`pagamentos_pendentes?id=eq.${pag.id}`); await enviarWhats(phoneNumberId, from, `🔗 Vinculei o comprovante de pagamento que voce mandou antes. Sem contar duas vezes. 🙂`); }
  }
  if (raiz.recriada) await perguntarResync(cliente, phoneNumberId, from);
  else { if (aprendida && notaRow?.id) await aprenderCategoria(cliente.id, cnpjEstab, estab, categoria); if (notaRow?.id) await mostrarMenuPos(cliente, phoneNumberId, from, { k: "nota", id: notaRow.id, est: estab, val: valorTotal }); }
}
async function processarGastoTexto(cliente: any, phoneNumberId: string, from: string, texto: string) {
  const m = texto.match(/gastei\s+([\d.,]+)\s+(.+)/i);
  if (!m) { await enviarWhats(phoneNumberId, from, "Manda a foto ou PDF da sua nota que eu organizo. Ou escreve: gastei 50 mercado."); return; }
  if (acessoBloqueado(cliente)) { await enviarBloqueio(phoneNumberId, from); return; }
  if (!cliente.drive_refresh_token) { await enviarWhats(phoneNumberId, from, "Sua conta ainda nao esta conectada ao Google Drive. Finalize o cadastro em usenotinha.com.br."); return; }
  const valor = parseValor(m[1]); let desc = m[2].trim();
  desc = desc.replace(/^(reais?|r\$)\s+/i, "").trim();
  const token = await googleAccessToken(cliente.drive_refresh_token);
  const sp = nowSP(); const dataBR = isoToBR(sp.iso);
  const nfCodigo = await gerarNfCodigo(cliente.id, sp.iso);
  const sheetId = await getOrCreateSheetMensal(token, cliente, sp.iso);
  const sheetLinha = await appendLinhaAba(token, sheetId, [dataBR, desc, "", "Outros", valor, 0, valor, "", nfCodigo, "","","","","","","","","",""], ANCHOR_NOTAS);
  const notaRow = await sbInsert("notas_fiscais", { cliente_id: cliente.id, nf_codigo: nfCodigo, data_compra: sp.iso, estabelecimento: desc, valor_bruto: valor, valor_total: valor, categoria: "Outros", provider: "manual", sheet_id: sheetId, sheet_linha: sheetLinha });
  const wamGasto = await enviarWhats(phoneNumberId, from, `✅ Anotado: ${brl(valor)} — ${desc}`);
  if (wamGasto && notaRow?.id) await sbPatch(`notas_fiscais?id=eq.${notaRow.id}`, { wam_id: wamGasto });
  if (notaRow?.id) await mostrarMenuPos(cliente, phoneNumberId, from, { k: "nota", id: notaRow.id, est: desc, val: valor });
}
async function registrarEntrada(cliente: any, token: string, valor: number, descricao: string, dataISO: string | null, origem: string, categoria = "Receita de serviços") {
  const sheetId = await getOrCreateSheetMensal(token, cliente, dataISO);
  const dataBR = dataISO ? isoToBR(dataISO) : "";
  const sheetLinha = await appendLinhaAba(token, sheetId, [dataBR, descricao, categoria, valor], ANCHOR_ENTRADAS);
  return await sbInsert("entradas", { cliente_id: cliente.id, valor, descricao, categoria, data_entrada: dataISO, origem, sheet_id: sheetId, sheet_linha: sheetLinha });
}
async function tratarEscolhaCategoriaEntrada(cliente: any, phoneNumberId: string, from: string, texto: string): Promise<"applied" | "ignore"> {
  const t = texto.trim();
  const tl = t.toLowerCase();
  if (/^(ok|manter|mant[eé]m|t[aá] bom|isso|deixa|pode deixar|t[aá])\b/.test(tl)) { await enviarWhats(phoneNumberId, from, "👍 Categoria mantida."); return "applied"; }
  if (/^(resumo|relat|pdf|insights?|menu|op[çc]|ajuda|suporte|planilha|top|buscar|maiores|pre[çc]o|apagar|excluir|deletar|corrigir|corrige|ajustar|mudar|ress?incr|reconstru|gastei|recebi|ativar)/.test(tl)) return "ignore";
  let nova: string | null = null;
  if (/^\d+$/.test(tl)) { const i = parseInt(tl, 10); if (i >= 1 && i <= CATEGORIAS_ENTRADA.length) nova = CATEGORIAS_ENTRADA[i - 1]; }
  if (!nova) nova = t.slice(0, 40);
  if (!nova) return "ignore";
  nova = normalizarCategoriaEntrada(nova);
  const ent = (await sbSelect(`entradas?id=eq.${cliente.aguardando_categoria_entrada}&select=id,sheet_id,sheet_linha`))?.[0];
  if (!ent) { await enviarWhats(phoneNumberId, from, "Nao achei o recebimento pra mudar a categoria. 🙂"); return "applied"; }
  await sbPatch(`entradas?id=eq.${ent.id}`, { categoria: nova });
  if (cliente.drive_refresh_token && ent.sheet_id && ent.sheet_linha) { try { const token = await googleAccessToken(cliente.drive_refresh_token); await setCelula(token, ent.sheet_id, "Entradas", `C${ent.sheet_linha}`, nova); } catch (_) { } }
  await enviarWhats(phoneNumberId, from, `🏷️ Categoria do recebimento atualizada para *${nova}*.`);
  return "applied";
}
async function processarRecebimentoTexto(cliente: any, phoneNumberId: string, from: string, texto: string) {
  if (acessoBloqueado(cliente)) { await enviarBloqueio(phoneNumberId, from); return; }
  if (!cliente.drive_refresh_token) { await enviarWhats(phoneNumberId, from, "Sua conta ainda nao esta conectada ao Google Drive. Finalize o cadastro em usenotinha.com.br."); return; }
  const ehSalario = /\bsal[áa]rio\b/i.test(texto);
  const parsed = parseValorTexto(texto);
  if (!parsed) { await enviarWhats(phoneNumberId, from, "Quanto voce recebeu? Manda: recebi 5000. 🙂"); return; }
  const valor = parsed.valor;
  let desc = (parsed.resto || "").replace(/\b(recebi|recebimento|meu|minha|esse m[êe]s|este m[êe]s|do m[êe]s|no m[êe]s|de|do|da|no|na|foi|e|é|reais?|r\$|sal[áa]rio)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!desc) desc = ehSalario ? "Salário" : "Recebimento";
  const catSugerida = ehSalario ? "Salário" : "Receita de serviços";
  const token = await googleAccessToken(cliente.drive_refresh_token);
  const entRow = await registrarEntrada(cliente, token, valor, desc, nowSP().iso, "texto", catSugerida);
  await enviarWhats(phoneNumberId, from, `✅ Recebimento anotado: ${brl(valor)} — ${desc}`);
  if (entRow?.id) await mostrarMenuPos(cliente, phoneNumberId, from, { k: "entrada", id: entRow.id, est: desc, val: valor });
}
async function processarRecebimentoImagem(cliente: any, phoneNumberId: string, from: string, mediaId: string) {
  if (acessoBloqueado(cliente)) { await enviarBloqueio(phoneNumberId, from); return; }
  if (!cliente.drive_refresh_token) { await enviarWhats(phoneNumberId, from, "Sua conta ainda nao esta conectada ao Google Drive. Finalize o cadastro em usenotinha.com.br."); return; }
  if (cliente.aguardando_data_nf) { await avisarPendente(cliente, phoneNumberId, from); return; }
  const { bytes, mime } = await baixarImagem(mediaId);
  let extra;
  try { extra = await extrairNF(bytes, mime); } catch { await enviarWhats(phoneNumberId, from, "Tive dificuldade pra ler esse recibo. Tenta de novo, inteiro e bem iluminado."); return; }
  if (extra.dados?.erro === "nao_e_nota_fiscal") { await enviarWhats(phoneNumberId, from, "Nao consegui ler um recibo nessa imagem. Manda o comprovante inteiro, por favor."); return; }
  const d = extra.dados;
  const dataISO = dataBRtoISO(d.data) ?? nowSP().iso;
  const valor = parseValor(d.valor_total);
  const itens = Array.isArray(d.itens) ? d.itens : [];
  const desc = itens.length ? itens.map((i: any) => i.descricao).filter(Boolean).slice(0, 3).join(", ") : (d.estabelecimento || "Recebimento");
  const token = await googleAccessToken(cliente.drive_refresh_token);
  const raiz = await garantirRaiz(token, cliente);
  const pastaMes = await garantirPastaMes(token, cliente, dataISO);
  const sp = nowSP();
  await subirImagem(token, pastaMes, `${dataISO.replace(/-/g, "")}_${sp.hora}_RECEBIMENTO.${extDe(mime)}`, bytes, mime);
  const entRow = await registrarEntrada(cliente, token, valor, desc, dataISO, "imagem");
  await enviarWhats(phoneNumberId, from, `✅ Recebimento registrado: ${brl(valor)}\n🧾 ${desc}`);
  if (raiz.recriada) await perguntarResync(cliente, phoneNumberId, from);
  else if (entRow?.id) await mostrarMenuPos(cliente, phoneNumberId, from, { k: "entrada", id: entRow.id, est: desc, val: valor });
}
function ehPremium(cliente: any): boolean { return String(cliente.plano_tier ?? "").toLowerCase() === "premium"; }
async function avisarPremium(phoneNumberId: string, from: string) { await enviarWhats(phoneNumberId, from, "✨ Esse recurso é exclusivo do plano *Premium*. Dá uma olhada em usenotinha.com.br pra fazer upgrade. 🙂"); }
async function listarProdutosPreco(cliente: any, phoneNumberId: string, from: string) {
  if (!ehPremium(cliente)) { await avisarPremium(phoneNumberId, from); return; }
  const rows = await sbRpc("produtos_do_cliente", { p_cliente_id: cliente.id, p_limit: 10 });
  if (!Array.isArray(rows) || rows.length === 0) { await enviarWhats(phoneNumberId, from, "📈 Ainda não tenho produtos seus registrados pra comparar. Manda umas notas que eu aprendo. 🙂"); return; }
  const linhas = rows.map((p: any, i: number) => `${i + 1}) ${p.descricao} — ${p.vezes}x em ${p.lugares} ${Number(p.lugares) === 1 ? "lugar" : "lugares"}`).join("\n");
  const ctx = { tipo: "preco_lista", lista: rows.map((p: any) => p.descricao) };
  await sbPatch(`clientes?id=eq.${cliente.id}`, { menu_ctx: ctx });
  cliente.menu_ctx = ctx;
  await enviarWhats(phoneNumberId, from, `📈 *Comparar preços*\nQual produto? Responde *só o número*:\n\n${linhas}\n\nOu manda direto: *preço café*.`);
}
async function compararPrecoProduto(cliente: any, phoneNumberId: string, from: string, termo: string) {
  if (!ehPremium(cliente)) { await avisarPremium(phoneNumberId, from); return; }
  const rows = await sbRpc("comparar_preco_produto", { p_cliente_id: cliente.id, p_termo: termo });
  if (!Array.isArray(rows) || rows.length === 0) { await enviarWhats(phoneNumberId, from, `🏷️ Ainda não tenho *${termo}* suficiente pra comparar. Compra mais um pouco que eu te mostro. 🙂`); return; }
  const fmtLugar = (r: any) => `${r.estabelecimento}${r.endereco ? `\n📍 ${r.endereco}` : ""}`;
  if (rows.length === 1) {
    const r = rows[0];
    await enviarWhats(phoneNumberId, from, `🏷️ *${termo}*\n\nSó vi esse produto em 1 lugar até agora:\n${fmtLugar(r)}\n💰 ${brl(r.preco)} (${r.compras}x)`);
    return;
  }
  const barato = rows[0], caro = rows[rows.length - 1];
  if (Math.abs(Number(caro.preco) - Number(barato.preco)) < 0.01) {
    await enviarWhats(phoneNumberId, from, `🏷️ *${termo}*: preços iguais (${brl(barato.preco)}) em ${rows.map((r: any) => r.estabelecimento).join(", ")}.`);
    return;
  }
  const meio = rows.length > 2 ? `\n_(mais ${rows.length - 2} ${rows.length - 2 === 1 ? "lugar" : "lugares"} entre os dois)_\n` : "";
  await enviarWhats(phoneNumberId, from, `📈 *${termo}*\n\n🟢 *Mais barato*: ${brl(barato.preco)}\n${fmtLugar(barato)}\n\n🔴 *Mais caro*: ${brl(caro.preco)}\n${fmtLugar(caro)}\n${meio}\n💡 Diferença de ${brl(Number(caro.preco) - Number(barato.preco))} por unidade.`);
}
async function iniciarBuscar(cliente: any, phoneNumberId: string, from: string) {
  if (!ehPremium(cliente)) { await avisarPremium(phoneNumberId, from); return; }
  const rows = await sbRpc("categorias_do_cliente", { p_cliente_id: cliente.id });
  if (!Array.isArray(rows) || rows.length === 0) { await enviarWhats(phoneNumberId, from, "🔎 Ainda não tem lançamentos pra buscar. Manda uma nota primeiro. 🙂"); return; }
  const linhas = rows.map((c: any, i: number) => `${i + 1}) ${c.categoria} — ${c.qtd} ${Number(c.qtd) === 1 ? "lançamento" : "lançamentos"} (${brl(c.total)})`).join("\n");
  const ctx = { tipo: "buscar_lista", lista: rows.map((c: any) => c.categoria) };
  await sbPatch(`clientes?id=eq.${cliente.id}`, { menu_ctx: ctx });
  cliente.menu_ctx = ctx;
  await enviarWhats(phoneNumberId, from, `🔎 *Buscar lançamentos*\nEscolhe a categoria (responde *só o número*):\n\n${linhas}\n\nOu busca por nome: *buscar mercado*.`);
}
async function buscarLancamentos(cliente: any, phoneNumberId: string, from: string, filtro: { termo?: string; categoria?: string }) {
  if (!ehPremium(cliente)) { await avisarPremium(phoneNumberId, from); return; }
  const rows = await sbRpc("buscar_lancamentos", { p_cliente_id: cliente.id, p_termo: filtro.termo ?? null, p_categoria: filtro.categoria ?? null, p_limit: 15 });
  const rotulo = filtro.categoria ?? filtro.termo ?? "";
  if (!Array.isArray(rows) || rows.length === 0) { await enviarWhats(phoneNumberId, from, `🔎 Não achei lançamentos pra *${rotulo}*. Tenta outro termo ou manda *buscar* pra ver as categorias.`); return; }
  const linhas = rows.map((n: any) => `${n.data_compra ? isoToBR(n.data_compra).slice(0, 5) : "s/ data"} — ${brl(n.valor_total)} — ${n.estabelecimento}`).join("\n");
  const aviso = rows.length === 15 ? "\n\n_Mostrando os 15 mais recentes._" : "";
  await enviarWhats(phoneNumberId, from, `🔎 *${rotulo}* — lançamentos:\n\n${linhas}${aviso}`);
}
async function mostrarMaioresGastos(cliente: any, phoneNumberId: string, from: string) {
  if (!ehPremium(cliente)) { await avisarPremium(phoneNumberId, from); return; }
  const rows = await sbRpc("maiores_gastos_mes", { p_cliente_id: cliente.id, p_limit: 5 });
  if (!Array.isArray(rows) || rows.length === 0) { await enviarWhats(phoneNumberId, from, "🧠 Ainda não tem gastos registrados esse mês. 🙂"); return; }
  const linhas = rows.map((g: any, i: number) => `${i + 1}. ${g.estabelecimento} — ${brl(g.valor_total)} (${g.data_compra ? isoToBR(g.data_compra).slice(0, 5) : "s/ data"}${g.categoria ? " · " + g.categoria : ""})`).join("\n");
  await enviarWhats(phoneNumberId, from, `🧠 *Maiores gastos de ${anoMes(null).amigavel}* (por valor):\n\n${linhas}\n\n_Pra ver os produtos mais frequentes, manda *top produtos*._`);
}
async function mostrarInsights(cliente: any, phoneNumberId: string, from: string) {
  if (!ehPremium(cliente)) { await avisarPremium(phoneNumberId, from); return; }
  const j = await sbRpc("insights_semana", { p_cliente_id: cliente.id });
  if (!j) { await enviarWhats(phoneNumberId, from, "Não consegui montar seus insights agora. Tenta de novo daqui a pouco."); return; }
  if (!Number(j.gasto_atual) && !Number(j.gasto_anterior)) { await enviarWhats(phoneNumberId, from, `✨ Semana tranquila: nada registrado entre ${j.ini_atual} e ${j.fim_atual}. 🙂`); return; }
  const varTxt = j.variacao_pct != null ? ` (${Number(j.variacao_pct) > 0 ? "📈 +" : (Number(j.variacao_pct) < 0 ? "📉 " : "➡️ ")}${String(j.variacao_pct).replace(".", ",")}% vs 7 dias antes: ${brl(j.gasto_anterior)})` : ` (7 dias antes: ${brl(j.gasto_anterior)})`;
  const linhas = [`✨ *Insights da semana* (${j.ini_atual} a ${j.fim_atual})`, "", `💸 Gasto: ${brl(j.gasto_atual)}${varTxt}`, `🧾 Registros: ${j.qtd_atual} (antes: ${j.qtd_anterior})`];
  if (j.top_categoria) linhas.push(`🏷️ Categoria destaque: ${j.top_categoria.categoria} (${brl(j.top_categoria.total)})`);
  if (j.maior_alta) linhas.push(`📈 Maior alta: ${j.maior_alta.categoria} (+${brl(j.maior_alta.delta)})`);
  if (j.dia_pico) linhas.push(`📅 Dia mais pesado: ${j.dia_pico.dia} (${brl(j.dia_pico.total)})`);
  await enviarWhats(phoneNumberId, from, linhas.join("\n"));
}
async function pedirRelatorioFotos(cliente: any, phoneNumberId: string, from: string) {
  if (!ehPremium(cliente)) { await avisarPremium(phoneNumberId, from); return; }
  await enviarWhats(phoneNumberId, from, "🧾 Preparando seu relatório com fotos... te mando o PDF já já. 🙂");
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/gerar-relatorio`, { method: "POST", headers: { "x-worker-secret": WORKER_SECRET, "Content-Type": "application/json" }, body: JSON.stringify({ cliente_id: cliente.id, phone_number_id: phoneNumberId, to: from }) });
    if (!r.ok) { console.error("gerar-relatorio", r.status, await r.text()); await enviarWhats(phoneNumberId, from, "Não consegui gerar o relatório agora. Tenta de novo daqui a pouco. 🙂"); }
  } catch (e) { console.error("gerar-relatorio", e); await enviarWhats(phoneNumberId, from, "Não consegui gerar o relatório agora. Tenta de novo daqui a pouco. 🙂"); }
}
function montarMenuCompleto(): string {
  return [ "📋 *Notinha — Menu completo*", "Responde *só o número*:", "", "*Base*", "1) 📸 *Enviar foto/PDF* → eu leio e organizo sozinho", "2) ✍️ *registrar gasto* → ex: gastei 50 mercado", "3) 💰 *registrar recebimento* → ex: recebi 500 salário", "4) 📊 *resumo* → gasto, recebido e saldo do mês atual", "5) 📅 *resumo mês passado* → mesmo resumo do mês anterior", "6) 📄 *relatório* → PDF do mês", "", "*Premium*", "7) ✨ *insights* → comparativo personalizado da semana", "8) 🔎 *buscar* → acha lançamentos por termo (ex: mercado)", "9) 🧠 *maiores gastos* → top 5 do mês por valor", "10) 🧾 *relatório com fotos* → PDF do mês + notas anexadas", "11) 📈 *preço* → compara um produto entre lugares", "", "*Ajuda*", "12) ❓ *ajuda* → abre o FAQ; se não resolver, fala com a gente" ].join("\n");
}
function montarMenuPos(): string {
  return [ "Posso te ajudar em algo? Responde *só o número*:", "", "1️⃣ Resumo do mês", "2️⃣ Alterar categoria — use \"Responder\" na foto da nota e escreva a categoria", "3️⃣ Apagar última nota", "4️⃣ Relatório PDF (em breve)", "5️⃣ Menu" ].join("\n");
}
async function mostrarMenuPos(cliente: any, phoneNumberId: string, from: string, ctx: any) {
  await sbPatch(`clientes?id=eq.${cliente.id}`, { menu_ctx: ctx });
  await enviarWhats(phoneNumberId, from, montarMenuPos());
}
async function abrirMenu(cliente: any, phoneNumberId: string, from: string) {
  await sbPatch(`clientes?id=eq.${cliente.id}`, { menu_ctx: { tipo: "completo" } });
  cliente.menu_ctx = { tipo: "completo" };
  await enviarWhats(phoneNumberId, from, montarMenuCompleto());
}
async function tratarMenuNav(cliente: any, phoneNumberId: string, from: string, texto: string): Promise<boolean> {
  const ctx = cliente.menu_ctx;
  if (!ctx || !ctx.tipo) return false;
  const t = texto.trim();
  if (!/^\d{1,2}$/.test(t)) return false;
  const op = parseInt(t, 10);
  if (ctx.tipo === "preco_lista" || ctx.tipo === "buscar_lista") {
    const lista = Array.isArray(ctx.lista) ? ctx.lista : [];
    await sbPatch(`clientes?id=eq.${cliente.id}`, { menu_ctx: null });
    cliente.menu_ctx = null;
    if (op < 1 || op > lista.length) { await enviarWhats(phoneNumberId, from, "Esse número não tá na lista. Manda *preço* ou *buscar* de novo que eu mostro as opções. 🙂"); return true; }
    if (ctx.tipo === "preco_lista") await compararPrecoProduto(cliente, phoneNumberId, from, String(lista[op - 1]));
    else await buscarLancamentos(cliente, phoneNumberId, from, { categoria: String(lista[op - 1]) });
    return true;
  }
  if (op < 1 || op > 12) return false;
  await sbPatch(`clientes?id=eq.${cliente.id}`, { menu_ctx: null });
  cliente.menu_ctx = null;
  const EMBREVE = "🔧 Esse recurso está chegando. Por ora, manda *resumo* ou *menu*. 🙂";
  if (op === 1) { await enviarWhats(phoneNumberId, from, "📸 Manda a *foto* ou *PDF* da nota que eu leio e organizo sozinho."); return true; }
  if (op === 2) { await enviarWhats(phoneNumberId, from, "✍️ Pra registrar um gasto, escreve: *gastei 50 mercado*."); return true; }
  if (op === 3) { await enviarWhats(phoneNumberId, from, "💰 Pra registrar um recebimento, escreve: *recebi 500 salário*."); return true; }
  if (op === 4) { await tratarComando(cliente, phoneNumberId, from, "resumo"); return true; }
  if (op === 5) { const [ay, am2] = nowSP().iso.split("-").map(Number); const pm = am2 === 1 ? 12 : am2 - 1; const py = am2 === 1 ? ay - 1 : ay; await tratarComando(cliente, phoneNumberId, from, `resumo ${String(pm).padStart(2, "0")}/${py}`); return true; }
  if (op === 6) { await tratarComando(cliente, phoneNumberId, from, "relatório"); return true; }
  if (op === 7) { await tratarComando(cliente, phoneNumberId, from, "insights"); return true; }
  if (op === 8) { await iniciarBuscar(cliente, phoneNumberId, from); return true; }
  if (op === 9) { await tratarComando(cliente, phoneNumberId, from, "maiores gastos"); return true; }
  if (op === 10) { await pedirRelatorioFotos(cliente, phoneNumberId, from); return true; }
  if (op === 11) { await listarProdutosPreco(cliente, phoneNumberId, from); return true; }
  if (op === 12) { await tratarComando(cliente, phoneNumberId, from, "ajuda"); return true; }
  await enviarWhats(phoneNumberId, from, EMBREVE);
  return true;
}
async function mostrarListaCategoria(cliente: any, phoneNumberId: string, from: string, notaId: string) {
  await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_categoria_nf: notaId });
  const lista = CATEGORIAS.map((c, i) => `${i + 1} ${c}`).join("\n");
  await enviarWhats(phoneNumberId, from, `🏷️ Qual a categoria? Responde *só o número*:\n${lista}\n\nOu escreve *só o nome* da categoria.`);
}
async function mostrarListaCategoriaEntrada(cliente: any, phoneNumberId: string, from: string, entradaId: string) {
  await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_categoria_entrada: entradaId });
  const lista = CATEGORIAS_ENTRADA.map((c, i) => `${i + 1} ${c}`).join("\n");
  await enviarWhats(phoneNumberId, from, `🏷️ Qual a categoria do recebimento? Responde *só o número*:\n${lista}`);
}
async function tratarMenuPos(cliente: any, phoneNumberId: string, from: string, texto: string): Promise<boolean> {
  const ctx = cliente.menu_ctx;
  if (!ctx) return false;
  const t = texto.trim();
  if (!/^[1-5]$/.test(t)) return false;
  await sbPatch(`clientes?id=eq.${cliente.id}`, { menu_ctx: null });
  cliente.menu_ctx = null;
  const op = parseInt(t, 10);
  if (op === 1) { await tratarComando(cliente, phoneNumberId, from, "resumo"); return true; }
  if (op === 2) {
    if (ctx.k === "entrada") await mostrarListaCategoriaEntrada(cliente, phoneNumberId, from, ctx.id);
    else await mostrarListaCategoria(cliente, phoneNumberId, from, ctx.id);
    return true;
  }
  if (op === 3) {
    let nota: any = null;
    if (ctx.k === "nota" && ctx.id) nota = (await sbSelect(`notas_fiscais?id=eq.${ctx.id}&select=id,sheet_id,sheet_linha,estabelecimento,valor_total`))?.[0];
    if (!nota) nota = await ultimaNota(cliente.id);
    if (!nota) { await enviarWhats(phoneNumberId, from, "Nao achei a nota pra apagar. 🙂"); return true; }
    if (cliente.drive_refresh_token && nota.sheet_id && nota.sheet_linha) { try { const token = await googleAccessToken(cliente.drive_refresh_token); await limparLinhaNotas(token, nota.sheet_id, nota.sheet_linha); } catch (_) { } }
    await sbDelete(`itens?nf_id=eq.${nota.id}`);
    await sbDelete(`notas_fiscais?id=eq.${nota.id}`);
    await enviarWhats(phoneNumberId, from, `🗑️ Apaguei a nota (${nota.estabelecimento ?? "—"} — ${brl(nota.valor_total)}).`);
    return true;
  }
  if (op === 4) { await enviarWhats(phoneNumberId, from, "📄 Relatório em PDF disponível em breve. Por ora, manda *resumo* que eu te mostro o mes. 🙂"); return true; }
  await abrirMenu(cliente, phoneNumberId, from);
  return true;
}
async function tratarComando(cliente: any, phoneNumberId: string, from: string, texto: string): Promise<boolean> {
  const t = texto.toLowerCase();
  if (/^\s*(recebi|recebimento)\b/i.test(texto) || /\bsal[áa]rio\b/i.test(texto)) { await processarRecebimentoTexto(cliente, phoneNumberId, from, texto); return true; }
  if (/\bress?incroniz/i.test(t) || /\breconstruir?\b/i.test(t)) { if (acessoBloqueado(cliente)) { await enviarBloqueio(phoneNumberId, from); return true; } await enviarWhats(phoneNumberId, from, "🔄 Beleza! Reconstruindo suas pastas e planilhas..."); await ressincronizar(cliente, phoneNumberId, from); return true; }
  if (/^\s*(apagar|excluir|deletar)\s+(a\s+)?(ultima|última|nota)/i.test(texto)) {
    const nota = await ultimaNota(cliente.id);
    if (!nota) { await enviarWhats(phoneNumberId, from, "Nao achei nenhuma nota recente pra apagar."); return true; }
    if (cliente.drive_refresh_token && nota.sheet_id && nota.sheet_linha) { const token = await googleAccessToken(cliente.drive_refresh_token); await limparLinhaNotas(token, nota.sheet_id, nota.sheet_linha); }
    await sbDelete(`itens?nf_id=eq.${nota.id}`);
    await sbDelete(`notas_fiscais?id=eq.${nota.id}`);
    await enviarWhats(phoneNumberId, from, `🗑️ Apaguei a última nota (${nota.estabelecimento ?? "—"} — ${brl(nota.valor_total)}).`);
    return true;
  }
  const mcc = texto.match(/^\s*corrigir\s+categoria\s+(.+)/i);
  if (mcc) {
    const nova = normalizarCategoria(mcc[1].trim().slice(0, 40));
    const nota = (await sbSelect(`notas_fiscais?cliente_id=eq.${cliente.id}&sheet_linha=not.is.null&order=criado_em.desc&limit=1&select=id,sheet_id,sheet_linha,estabelecimento,cnpj_estabelecimento`))?.[0];
    if (!nota) { await enviarWhats(phoneNumberId, from, "Nao achei nenhuma nota recente pra mudar a categoria."); return true; }
    await sbPatch(`notas_fiscais?id=eq.${nota.id}`, { categoria: nova });
    if (cliente.drive_refresh_token && nota.sheet_id && nota.sheet_linha) { try { const token = await googleAccessToken(cliente.drive_refresh_token); await setCelula(token, nota.sheet_id, "Notas", `D${nota.sheet_linha}`, nova); } catch (_) { } }
    await aprenderCategoria(cliente.id, nota.cnpj_estabelecimento ?? null, nota.estabelecimento ?? "", nova);
    await enviarWhats(phoneNumberId, from, `🏷️ Categoria atualizada para *${nova}*. (Dica: pra mudar uma nota específica, responda a mensagem dela.)`);
    return true;
  }
  const mv = texto.match(/^\s*(?:corrigir|corrige|ajustar|mudar)\s+(?:o\s+)?valor\s+(?:p(?:ra|ara)\s+)?([\d.,]+)/i);
  if (mv) {
    const novo = parseValor(mv[1]);
    const nota = await ultimaNota(cliente.id);
    if (!nota) { await enviarWhats(phoneNumberId, from, "Nao achei nenhuma nota recente pra corrigir."); return true; }
    if (cliente.drive_refresh_token && nota.sheet_id && nota.sheet_linha) { const token = await googleAccessToken(cliente.drive_refresh_token); await setCelula(token, nota.sheet_id, "Notas", `G${nota.sheet_linha}`, String(novo)); }
    await sbPatch(`notas_fiscais?id=eq.${nota.id}`, { valor_total: novo });
    await enviarWhats(phoneNumberId, from, `✅ Corrigi o valor da última nota (${nota.estabelecimento ?? "—"}) para ${brl(novo)}.`);
    return true;
  }
  if (/ajuda\s+foto/.test(t)) { await enviarWhats(phoneNumberId, from, "📸 Dicas: lugar iluminado, superficie lisa, camera reta, pega do topo (CNPJ) ate o total."); return true; }
  if (/\bsuporte\b/.test(t)) { await enviarWhats(phoneNumberId, from, "🆘 Fale com a gente: usenotinha.com.br/contato"); return true; }
  if (/\bajuda\b/.test(t)) { await enviarWhats(phoneNumberId, from, "❓ Perguntas frequentes: https://usenotinha.com.br/#faq\n\nNao achou? Manda *suporte*."); return true; }
  if (/^\s*mais\s*$/.test(t)) { await abrirMenu(cliente, phoneNumberId, from); return true; }
  if (/\b(menu|op[çc][õo]es)\b/.test(t)) { await abrirMenu(cliente, phoneNumberId, from); return true; }
  if (/relat[óo]rio\s+(com\s+)?fotos/.test(t)) { await pedirRelatorioFotos(cliente, phoneNumberId, from); return true; }
  if (/\b(relat[óo]rio|pdf)\b/.test(t)) { await enviarWhats(phoneNumberId, from, "📄 O relatório simples em PDF esta em manutencao rapida. Por ora, manda *relatório com fotos* ou *resumo*. 🙂"); return true; }
  if (/\binsights?\b/.test(t)) { await mostrarInsights(cliente, phoneNumberId, from); return true; }
  if (/\bresumo\b/.test(t)) {
    const resto = (t.match(/\bresumo\b\s*(.*)$/)?.[1] ?? "").trim();
    let pRef: string | null = null;
    if (resto) { pRef = parsePeriodoResumo(resto); if (pRef == null) { await enviarWhats(phoneNumberId, from, "Nao entendi o mes. Manda: *resumo* ou *resumo maio* ou *resumo 05/2026*"); return true; } }
    const body: any = { p_cliente_id: cliente.id };
    if (pRef) body.p_ref = pRef;
    const j = await sbRpc("resumo_mes", body);
    if (!j) { await enviarWhats(phoneNumberId, from, "Nao consegui montar seu resumo agora. Tenta de novo daqui a pouco."); return true; }
    if (!j.qtd_notas && !Number(j.total_recebido) && !Number(j.total_gasto)) { await enviarWhats(phoneNumberId, from, `📊 ${j.mes}: nada registrado nesse mes ainda.`); return true; }
    const cats = (j.top_categorias || []).map((c: any) => `${c.categoria} (${brl(c.total)})`).join(", ") || "—";
    const lojas = (j.top_lojas || []).map((l: any) => `${l.estabelecimento} (${brl(l.total)})`).join(", ") || "—";
    await enviarWhats(phoneNumberId, from, `📊 Resumo de ${j.mes}\n\n💸 Gasto: ${brl(j.total_gasto)}\n💰 Recebido: ${brl(j.total_recebido)}\n⚖️ Saldo: ${brl(j.saldo)}\n🧾 Notas: ${j.qtd_notas}\n\n🏷️ Top categorias: ${cats}\n🏪 Onde mais gastou: ${lojas}`);
    return true;
  }
  if (/maiores?\s+gastos?/.test(t)) { await mostrarMaioresGastos(cliente, phoneNumberId, from); return true; }
  if (/top\s+produtos?/.test(t)) {
    const rows = await sbRpc("top_produtos_mes", { p_cliente_id: cliente.id, p_limit: 5 });
    if (!rows || rows.length === 0) { await enviarWhats(phoneNumberId, from, "Ainda nao tenho produtos suficientes desse mes pra listar. 😉"); return true; }
    const linhas = rows.map((p: any, i: number) => `${i + 1}. ${p.descricao} — ${p.vezes}x — ${brl(p.total)}`).join("\n");
    await enviarWhats(phoneNumberId, from, `🛒 Seus produtos do mes:\n\n${linhas}`);
    return true;
  }
  if (/^\s*pre[çc]o\s*$/.test(t)) { await listarProdutosPreco(cliente, phoneNumberId, from); return true; }
  const mp = t.match(/^\s*pre[çc]o\s+(?:d[eo]\s+)?(.+)/);
  if (mp) { await compararPrecoProduto(cliente, phoneNumberId, from, mp[1].trim().slice(0, 60)); return true; }
  if (/^\s*buscar\s*$/.test(t)) { await iniciarBuscar(cliente, phoneNumberId, from); return true; }
  const mb = t.match(/^\s*buscar\s+(.+)/);
  if (mb) { await buscarLancamentos(cliente, phoneNumberId, from, { termo: mb[1].trim().slice(0, 40) }); return true; }
  if (/\bplanilha\b/.test(t)) {
    if (!cliente.drive_refresh_token) { await enviarWhats(phoneNumberId, from, "Sua planilha ainda nao foi criada. Finalize a conexao do Drive em usenotinha.com.br."); return true; }
    const token = await googleAccessToken(cliente.drive_refresh_token);
    const sheetId = await getOrCreateSheetMensal(token, cliente, null);
    await enviarWhats(phoneNumberId, from, `📊 Sua planilha de ${anoMes(null).amigavel}:\nhttps://docs.google.com/spreadsheets/d/${sheetId}/edit`);
    return true;
  }
  return false;
}
const RE_DATA = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/;
const RE_HORA = /(\d{1,2})[:hH](\d{2})/;
async function tratarCorrecaoData(cliente: any, phoneNumberId: string, from: string, texto: string): Promise<"applied" | "skip" | "need_date" | "notdate"> {
  const t = texto.trim().toLowerCase();
  if (/^(n[ãa]o|depois|agora n[ãa]o|deixa|pular)\b/.test(t)) { await enviarWhats(phoneNumberId, from, "Beleza, deixei essa nota de lado. Quando quiser, manda a data dela. 👍"); return "skip"; }
  const md = texto.match(RE_DATA);
  const mh = texto.match(RE_HORA);
  if (!md && !mh) return "notdate";
  let dataISO: string | null = null, horaShow: string | null = null;
  if (md) { let [, dd, mm, aa] = md; if (aa.length === 2) aa = "20" + aa; dataISO = `${aa}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`; }
  if (mh) { const hh = mh[1].padStart(2, "0"); horaShow = `${hh}:${mh[2]}`; }
  if (!dataISO) { await enviarWhats(phoneNumberId, from, "Ainda preciso da *data*. Manda assim: *12/05/2026*."); return "need_date"; }
  const notaId = cliente.aguardando_data_nf;
  const notas = await sbSelect(`notas_fiscais?id=eq.${notaId}&select=*`);
  const nota = notas?.[0];
  if (!nota) { await enviarWhats(phoneNumberId, from, "Nao achei essa nota pra atualizar."); return "applied"; }
  const novaHora = horaShow ? `${horaShow}:00` : nota.hora_compra;
  if (cliente.drive_refresh_token) {
    const token = await googleAccessToken(cliente.drive_refresh_token);
    await garantirRaiz(token, cliente);
    const pastaMes = await garantirPastaMes(token, cliente, dataISO);
    const sheetId = await getOrCreateSheetMensal(token, cliente, dataISO, pastaMes);
    const dataBR = isoToBR(dataISO);
    const linhaNota = await appendLinhaAba(token, sheetId, [ dataBR, nota.estabelecimento ?? "", nota.endereco ?? "", nota.categoria ?? "", nota.valor_bruto ?? "", nota.valor_desconto ?? "", nota.valor_total ?? "", nota.forma_pagamento ?? "", nota.nf_codigo ?? "", nota.valor_icms ?? "", nota.valor_pis ?? "", nota.valor_cofins ?? "", nota.valor_ipi ?? "", nota.valor_ii ?? "", nota.valor_cbs ?? "", nota.valor_ibs ?? "", nota.valor_is ?? "", nota.valor_tributos ?? "", nota.drive_file_id ? `https://drive.google.com/file/d/${nota.drive_file_id}/view` : "" ], ANCHOR_NOTAS);
    const itens = await sbSelect(`itens?nf_id=eq.${notaId}&select=descricao,quantidade,unidade,valor_unitario,valor_total_item,desconto_item,ean,ncm`);
    if (Array.isArray(itens) && itens.length) { await appendRange(token, sheetId, itens.map((it: any) => [ dataBR, nota.nf_codigo ?? "", it.descricao ?? "", nota.categoria ?? "", it.quantidade ?? "", it.unidade ?? "", it.valor_unitario ?? "", it.valor_total_item ?? "", it.desconto_item ?? "", it.ean ?? "", it.ncm ?? "" ]), ANCHOR_ITENS); }
    if (nota.drive_file_id) await moverArquivo(token, nota.drive_file_id, pastaMes, nota.drive_pasta_id ?? undefined);
    await sbPatch(`notas_fiscais?id=eq.${notaId}`, { data_compra: dataISO, hora_compra: novaHora, sheet_id: sheetId, sheet_linha: linhaNota, drive_pasta_id: pastaMes });
    const pag = await acharPagamentoPendente(cliente.id, { tefAut: normTef(nota.tef_aut), tefNsu: normTef(nota.tef_nsu), tefDoc: normTef(nota.tef_doc), cnpj: nota.cnpj_estabelecimento, valor: nota.valor_total, dataISO, hora: novaHora });
    if (pag) { await anexarPagamentoNaNota(token, { ...nota, sheet_id: sheetId, sheet_linha: linhaNota }, { forma_pagamento: pag.forma_pagamento, cartao_final: pag.cartao_final, cartao_bandeira: pag.cartao_bandeira, tef_aut: pag.tef_aut, tef_nsu: pag.tef_nsu, tef_doc: pag.tef_doc, terminal: pag.terminal, saldo_voucher: pag.saldo_voucher }); await sbDelete(`pagamentos_pendentes?id=eq.${pag.id}`); }
    const wamData = await enviarWhats(phoneNumberId, from, `✅ Pronto! Registrei a nota em ${anoMes(dataISO).amigavel}.`);
    if (wamData) await sbPatch(`notas_fiscais?id=eq.${notaId}`, { wam_id: wamData });
    await mostrarMenuPos(cliente, phoneNumberId, from, { k: "nota", id: notaId, est: nota.estabelecimento ?? "—", val: nota.valor_total ?? 0 });
  }
  return "applied";
}
async function tentarAtivar(phoneNumberId: string, from: string, texto: string): Promise<boolean> {
  const m = texto.trim().match(/^ativar\s+([a-z0-9]+)/i);
  if (!m) return false;
  const codigo = m[1].toUpperCase();
  const achados = await sbSelect(`clientes?codigo_ativacao=eq.${codigo}&select=id,nome,ativado`);
  if (!achados || achados.length === 0) { await enviarWhats(phoneNumberId, from, "Codigo de ativacao invalido. Confira o link enviado no seu cadastro."); return true; }
  const c = achados[0];
  await sbPatch(`clientes?id=eq.${c.id}`, { telefone: from, ativado: true, ativado_em: new Date().toISOString() });
  await enviarWhats(phoneNumberId, from, `🎉 Tudo pronto${c.nome ? ", " + c.nome.split(" ")[0] : ""}! Sua conta esta ativa. Manda a foto ou PDF das suas notas que eu organizo no seu Drive.`);
  return true;
}
const RE_SIM = /^\s*(sim|quero|pode|isso|claro|aceito|por favor|positivo|s)\b/i;
const RE_NAO = /^\s*(n[ãa]o|depois|agora n[ãa]o|deixa|n)\b/i;
async function tratarRespostaCitada(cliente: any, phoneNumberId: string, from: string, msg: any, texto: string): Promise<boolean> {
  const ctxId = msg?.context?.id;
  if (!ctxId) return false;
  const nota = (await sbSelect(`notas_fiscais?cliente_id=eq.${cliente.id}&or=(wam_id.eq.${ctxId},wam_id_cliente.eq.${ctxId})&select=id,sheet_id,sheet_linha,estabelecimento,cnpj_estabelecimento,categoria`))?.[0];
  if (!nota) return false;
  let nova: string | null = null;
  const mcat = texto.match(/categoria\s+(?:para|pra|p\/|:|=)?\s*(.+)/i);
  nova = normalizarCategoria((mcat ? mcat[1] : texto).trim().slice(0, 40));
  if (!nova) { await enviarWhats(phoneNumberId, from, "Qual a categoria certa? Responde a nota assim: *categoria Restaurante*."); return true; }
  await sbPatch(`notas_fiscais?id=eq.${nota.id}`, { categoria: nova });
  if (cliente.drive_refresh_token && nota.sheet_id && nota.sheet_linha) { try { const token = await googleAccessToken(cliente.drive_refresh_token); await setCelula(token, nota.sheet_id, "Notas", `D${nota.sheet_linha}`, nova); } catch (_) { } }
  await aprenderCategoria(cliente.id, nota.cnpj_estabelecimento ?? null, nota.estabelecimento ?? "", nova);
  await enviarWhats(phoneNumberId, from, `🏷️ Categoria de ${nota.estabelecimento ?? "—"} atualizada para *${nova}*.`);
  return true;
}
async function processarMensagem(value: any, msg: any) {
  const phoneNumberId = value?.metadata?.phone_number_id;
  const from = msg.from;
  const tipo = msg.type;
  const textoMsg = tipo === "text" ? (msg.text?.body ?? "") : "";
  if (await tentarAtivar(phoneNumberId, from, textoMsg)) return;
  const clientes = await sbSelect(`clientes?telefone=eq.${from}&select=id,nome,ativado,plano_tier,aguardando_data_nf,aguardando_resync,aguardando_categoria_nf,aguardando_categoria_entrada,aguardando_comprovante_pend,drive_refresh_token,drive_folder_id,sheet_id,pagamento_status,trial_termina_em,menu_ctx`);
  const cliente = clientes?.[0];
  if (!cliente || !cliente.ativado) { await enviarWhats(phoneNumberId, from, "Ola! Nao reconheco esse numero. Para usar o Notinha, faca seu cadastro em usenotinha.com.br e ative pelo link que voce vai receber."); return; }
  try {
    if (tipo === "text" && msg?.context?.id) { if (await tratarRespostaCitada(cliente, phoneNumberId, from, msg, textoMsg)) return; }
    if (tipo === "text" && cliente.aguardando_resync) {
      if (RE_SIM.test(textoMsg)) { await ressincronizar(cliente, phoneNumberId, from); return; }
      if (RE_NAO.test(textoMsg)) { await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_resync: false }); await enviarWhats(phoneNumberId, from, "Tranquilo! Se mudar de ideia, manda *ressincronizar*. 🙂"); return; }
      await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_resync: false });
      cliente.aguardando_resync = false;
    }
    if (cliente.aguardando_categoria_nf) {
      if (tipo === "text") { const rc = await tratarEscolhaCategoria(cliente, phoneNumberId, from, textoMsg); await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_categoria_nf: null }); cliente.aguardando_categoria_nf = null; if (rc === "applied") return; }
      else { await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_categoria_nf: null }); cliente.aguardando_categoria_nf = null; }
    }
    if (cliente.aguardando_categoria_entrada) {
      if (tipo === "text") { const rc = await tratarEscolhaCategoriaEntrada(cliente, phoneNumberId, from, textoMsg); await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_categoria_entrada: null }); cliente.aguardando_categoria_entrada = null; if (rc === "applied") return; }
      else { await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_categoria_entrada: null }); cliente.aguardando_categoria_entrada = null; }
    }
    if (cliente.aguardando_comprovante_pend) {
      if (tipo === "text") { const rc = await tratarRespostaComprovante(cliente, phoneNumberId, from, textoMsg); await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_comprovante_pend: null }); cliente.aguardando_comprovante_pend = null; if (rc === "registrado") return; }
      else { await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_comprovante_pend: null }); cliente.aguardando_comprovante_pend = null; }
    }
    if (tipo === "image") {
      const legenda = (msg.image?.caption ?? "").toLowerCase();
      if (/receb|entrada/.test(legenda)) await processarRecebimentoImagem(cliente, phoneNumberId, from, msg.image.id);
      else await processarNota(cliente, phoneNumberId, from, msg.image.id, msg.id ?? null);
    } else if (tipo === "document") {
      const mimeDoc = msg.document?.mime_type ?? "";
      if (mimeDoc !== "application/pdf" && !mimeDoc.startsWith("image/")) { await enviarWhats(phoneNumberId, from, "Esse arquivo eu nao consigo ler. Manda a nota como *foto* ou *PDF*, por favor."); }
      else { const legenda = (msg.document?.caption ?? "").toLowerCase(); if (/receb|entrada/.test(legenda)) await processarRecebimentoImagem(cliente, phoneNumberId, from, msg.document.id); else await processarNota(cliente, phoneNumberId, from, msg.document.id, msg.id ?? null); }
    } else if (tipo === "text") {
      if (cliente.aguardando_data_nf) { const r = await tratarCorrecaoData(cliente, phoneNumberId, from, textoMsg); if (r === "applied" || r === "skip") { await sbPatch(`clientes?id=eq.${cliente.id}`, { aguardando_data_nf: null }); return; } if (r === "need_date") return; }
      if (await tratarMenuNav(cliente, phoneNumberId, from, textoMsg)) return;
      if (await tratarMenuPos(cliente, phoneNumberId, from, textoMsg)) return;
      if (!(await tratarComando(cliente, phoneNumberId, from, textoMsg))) { await processarGastoTexto(cliente, phoneNumberId, from, textoMsg); }
    } else { await enviarWhats(phoneNumberId, from, "Manda a foto ou PDF da sua nota fiscal que eu organizo pra voce. 📸"); }
  } catch (e) {
    if (e instanceof ErroGoogleAuth) { await enviarWhats(phoneNumberId, from, "⚠️ Perdi o acesso ao seu Google Drive — a conexao expirou ou foi revogada. Reconecte em usenotinha.com.br. Suas notas continuam salvas. 🙂"); return; }
    throw e;
  }
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const secret = req.headers.get("x-worker-secret");
  if (!WORKER_SECRET || secret !== WORKER_SECRET) return new Response("forbidden", { status: 403 });
  await sbRpc("redrive_travados", { p_min: 5 });
  let processados = 0;
  for (let i = 0; i < 25; i++) {
    let ev = await sbRpc("reivindicar_evento", {});
    if (Array.isArray(ev)) ev = ev[0];
    if (!ev || !ev.id) break;
    try {
      const value = ev.payload?.value;
      const msg = ev.payload?.msg;
      if (value && msg) await processarMensagem(value, msg);
      await sbPatch(`webhook_events?id=eq.${ev.id}`, { status: "concluido", processado_em: new Date().toISOString() });
    } catch (e) {
      const tentativas = ev.tentativas ?? 0;
      const desistir = tentativas >= 5;
      await sbPatch(`webhook_events?id=eq.${ev.id}`, { status: desistir ? "erro" : "pendente", erro: String(e).slice(0, 500) });
      if (desistir) { try { const ph = ev.payload?.value?.metadata?.phone_number_id; const fr = ev.payload?.msg?.from; if (ph && fr) await enviarWhats(ph, fr, "Tive um problema tecnico pra processar sua ultima mensagem. Pode tentar de novo? Se continuar, manda *suporte*."); } catch (_) { } }
    }
    processados++;
  }
  return new Response(JSON.stringify({ processados }), { status: 200, headers: { "Content-Type": "application/json" } });
});
