# Piloto restrito do Intelligence Engine v2

Implementado em produção em 11/09/2026. Destinatário e ID do cliente ficam somente no banco privado; não devem ser publicados neste repositório.

## Comportamento

O cadastro ativo do piloto recebe os comandos `inteligencia`, `assinaturas`, `recorrencias`, `meus lembretes`, `posso gastar 500` e `pausar alertas`. O processador verifica a configuração privada e o vínculo exato entre ID e telefone. Cadastro antigo inativo não participa. Flag global de comandos permanece false.

As NFs continuam entrando pelo processador existente e alimentam as mesmas tabelas usadas pelo motor v2. O job `notinha-piloto-alertas-15min` atualiza a análise do piloto a cada 15 minutos; os comandos também atualizam a análise. Não foram criadas notas fictícias. Durante a validação, uma NF real enviada pelo usuário foi processada com quatro itens, aumentando o histórico em uma nota. O evento teve assinatura validada e a análise v2 executada com os dados atualizados terminou sem erros.

O destinatário precisa estar ativado, ter aceitado termos, não estar cancelado/anonimizado, ter pagamento ativo ou cortesia válida e ter inteligência/proatividade habilitadas. Uma tabela singleton permite somente um piloto, com restrição de banco mantendo `global_habilitado=false`.

## Entrega

- WhatsApp: Cloud API direta da Meta, somente mensagem de texto livre. Exige timestamp da última mensagem recebida com HMAC válido e phone_number_id permitido. Atividade no site, atualização de nota e mensagens enviadas não abrem a janela.
- Janela: 24 horas, com margem de dois minutos. Sem timestamp confiável, não envia WhatsApp.
- Revisão de tarifa obrigatória em 01/10/2026 UTC: a elegibilidade WhatsApp expira nessa data; depois disso, o piloto usa e-mail até revisão explícita. Essa é uma salvaguarda de configuração, não afirmação de gratuidade permanente.
- E-mail: mesma conta Zoho e mecanismo OAuth já usados no projeto; destinatário vem do cadastro e precisa coincidir com o Google conectado. Nenhum novo serviço contratado.
- Limite dos insights: uma reserva de resumo por dia em America/Sao_Paulo, até cinco itens. Lembretes explicitamente pedidos pelo usuário têm fila independente, verificada a cada minuto, e não consomem esse limite.
- Deduplicação: ID do insight + hash dos dados, ou ID do lembrete + vencimento. Só lembretes com autorização externa explícita entram; candidatos automáticos não ganham essa autorização.
- Concorrência: bloqueio transacional e unicidade por cliente/dia. Uma resposta incerta ou reserva interrompida bloqueia envios até reconciliação manual. Não há retry cego após timeout. Falhas explícitas podem ser tentadas no dia seguinte.
- Se o WhatsApp rejeitar explicitamente, tenta e-mail. Timeout/resposta ambígua não dispara fallback, para evitar duas entregas.
- `aceito` significa aceitação pelo provedor, não comprovação de recebimento ou leitura pelo cliente.

## Segurança e custos

### Cadastro de lembretes pelo WhatsApp

O piloto agora reconhece pedidos como `Me lembre que amanhã às 10hs da manhã tenho corte de cabelo`. O parser determinístico suporta hoje/amanhã e datas DD/MM ou DD/MM/AAAA, com horas/minutos e manhã/tarde/noite. Datas relativas usam a data da mensagem recebida em São Paulo, não a hora de um eventual retry. Pedidos incompletos, múltiplos horários ou recorrência ainda não suportada recebem pedido de esclarecimento e não caem no registro de gastos.

A RPC exige evento original autenticado, vínculo com o piloto ativo e data futura em até 366 dias. Criações repetidas do mesmo compromisso/horário são deduplicadas. O limite é de 50 lembretes ativos. A confirmação inclui data e hora locais e só acontece após persistência. `meus lembretes` mostra também o horário.

O job `notinha-piloto-lembretes-minuto` verifica vencimentos a cada minuto e invoca o dispatcher somente se há um lembrete elegível. Lembretes usam a mesma política de WhatsApp gratuito/e-mail existente, mas reserva própria, independente do resumo diário. Após aceitação do provedor, o lembrete é concluído. Falhas explícitas têm até três tentativas, espaçadas por pelo menos cinco minutos; respostas incertas não são reenviadas automaticamente.

Validação: a mensagem real anteriormente não reconhecida foi reprocessada pelo worker atualizado, que persistiu o compromisso correto com envio externo ativo. 24 testes locais passaram, incluindo a frase exata, virada de dia/mês/ano, horários inválidos, criação autenticada e despacho de lembrete. Testes de banco com rollback cobriram deduplicação, evento inválido, não enviar cedo, independência do limite diário e conclusão após aceitação. Migration `pilot_natural_language_reminders`; SQL-fonte em `piloto-lembretes-schema.sql` e `piloto-lembretes-digest.sql`.

### Correção após feedback real

O usuário identificou que duas previsões de ausência eram compras de mercado, não contas recorrentes. O detector agora exclui categorias Mercado/Supermercado/Supermercados da inferência de contas. Os candidatos de mercado do piloto foram ignorados e os falsos insights descartados, preservando NFs e histórico de entregas. Alertas de atraso e projeção de obrigações futuras exigem recorrência confirmada. Compras de mercado continuam alimentando totais, categorias e variações de preço.

Verificação após a correção: zero alertas de recorrência pendente e um insight de preço no feed; reprocessamento não recria os falsos alertas. Teste transacional adicional confirma que candidata não gera atraso/previsão, enquanto uma conta confirmada ainda gera o alerta esperado. Migration: `exclude_groceries_from_recurring_bills`.

As duas novas tabelas têm RLS e não permitem leitura/escrita a anon/authenticated. As RPCs novas são SECURITY INVOKER, têm search_path fixo e EXECUTE somente para service_role. A Edge Function requer x-worker-secret em todos os caminhos, incluindo health. Não aceita telefone/e-mail arbitrário no corpo.

Health verificou autenticação Zoho e presença dos recursos de WhatsApp/HMAC, retornando apenas booleanos. Requisições reais sem autenticação ao dispatcher e sem assinatura ao webhook retornaram 401. Nenhuma credencial foi incluída em código, logs novos ou documentação. Tokens Zoho são enviados no corpo OAuth, não na URL.

O motor e os textos desta camada não chamam qualquer API de IA. **O OCR legado continua com Gemini e alternativas OpenAI/Claude potencialmente pagas.** Portanto, não se afirma custo zero do produto inteiro. Também não foi verificado o faturamento/franquia da conta Gemini, Zoho ou Supabase. O job consome banco/Edge Functions da infraestrutura existente; o e-mail consome sua quota existente.

A auditoria Supabase final mantém os avisos anteriores: quatro funções com search_path mutável, duas extensões no schema public e proteção de senha vazada desabilitada. As novas tabelas acrescentam apenas avisos informativos de RLS sem políticas, pois são deliberadamente exclusivas do backend.

Fontes: [tarifas oficiais Meta](https://business.whatsapp.com/products/platform-pricing), [funções e permissões Supabase](https://supabase.com/docs/guides/database/functions), [agendamento](https://supabase.com/docs/guides/functions/schedule-functions), [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [senhas comprometidas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Validação realizada

16 testes locais passaram: janela, margem, expiração de política, e-mail inválido/não verificado, cliente externo, parsing de valor brasileiro, autorização do dispatcher, envio por canal, rejeição e resposta incerta.

Também foram verificados: sintaxe TypeScript das funções; RPCs e privilégios reais; reserva/antiduplicidade/pausa em transação com rollback; atualização da janela somente para eventos marcados como autenticados em transação com rollback; health Zoho; primeiro resumo real aceito por e-mail; tentativa seguinte bloqueada; exatamente um cliente proativo, configuração global false. O webhook rejeitou POST sem assinatura em produção.

O primeiro alerta proativo foi por e-mail porque a janela estava fechada. Depois, uma NF legítima abriu a janela autenticada e o fluxo atual concluiu seu processamento. Não houve segundo alerta proativo por WhatsApp, respeitando o limite diário; esse caminho permanece validado por testes controlados. O texto de padrões de compra foi ajustado para não tratar ausência de nova compra como dívida.

## Operação e reversão

Para interromper imediatamente novos envios, definir `inteligencia_piloto.habilitado=false`, `comandos_habilitados=false` e `inteligencia_config.proativo_habilitado=false` para o cliente, ou enviar `pausar alertas` pelo WhatsApp enquanto o piloto está ativo. O cron só invoca o dispatcher quando o piloto está habilitado. Não é necessário apagar notas ou insights.

Para reconciliar uma entrega reservada/incerta, verificar o provedor antes de alterar seu status. Nunca limpar a reserva para tentar de novo sem confirmar que a mensagem anterior não foi aceita. A tabela de entregas preserva o histórico privado.

Schema aplicado: migration `restricted_intelligence_pilot`; comando de pausa: `pilot_pause_command`. SQL-fonte está nas propostas para rastreabilidade; não executar novamente em produção. A provisão do cliente foi feita separadamente por seleção exata do cadastro ativo.

