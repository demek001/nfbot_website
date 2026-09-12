export function whatsappGratuito(c: any, now = Date.now()): boolean {
  const inbound = Date.parse(c?.ultimo_inbound_em ?? '');
  const until = Date.parse(c?.whatsapp_gratis_ate ?? '');
  return Number.isFinite(inbound) && Number.isFinite(until) && inbound <= now
    && now < inbound + 24 * 3600000 - 120000 && now < until
    && !!c?.phone_number_id;
}
export function canalAlerta(c: any, now = Date.now()): 'whatsapp' | 'email' | null {
  if (whatsappGratuito(c, now)) return 'whatsapp';
  if (c?.email_verificado && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email ?? '')) return 'email';
  return null;
}
export function descreverInsight(i: any): string {
  const d = i.dados ?? {};
  const brl = (x: any) => Number(x ?? 0).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
  let detalhe = '';
  if (d.variacao_pct != null) detalhe = `Variação de ${d.variacao_pct}%.`;
  if (d.total_atual != null) detalhe += ` Antes: ${brl(d.total_anterior)}; últimos 30 dias: ${brl(d.total_atual)}.`;
  if (d.preco_atual != null) detalhe += ` ${String(d.descricao ?? '').slice(0,120)}: ${brl(d.preco_anterior_medio)} → ${brl(d.preco_atual)}.`;
  if (d.estabelecimento && d.valor_medio != null) detalhe += ` ${String(d.estabelecimento).slice(0,120)}: média ${brl(d.valor_medio)}.`;
  if (d.dias_atraso != null) detalhe += ` O registro esperado não apareceu há ${d.dias_atraso} dias. Pode ser apenas uma mudança na frequência de compra; isso não indica dívida.`;
  if (d.devido_em) detalhe += ` Previsto para ${new Date(d.devido_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}.`;
  const titulo = d.dias_atraso != null ? 'Um gasto recorrente esperado ainda não foi registrado' : String(i.titulo ?? '').slice(0,300);
  return `${titulo}\n${detalhe.trim()}`.trim();
}
export function textoAlerta(itens: any[]): string {
  return `💡 Notinha — alertas do seu piloto\n\n${itens.map(descreverInsight).join('\n\n')}\n\nBaseado nas notas registradas; recorrências são estimativas. Para pausar, envie “pausar alertas” no WhatsApp.`.slice(0,3900);
}

