# Notinha Intelligence Engine v2

Data: 2026-09-11

## Objetivo

Adicionar inteligência proativa ao Notinha sem tornar o produto dependente de uma IA generativa e sem criar custo novo de API nesta fase.

Princípios:

1. SQL, regras e estatística são o cérebro principal.
2. IA é uma camada substituível para interpretação de conteúdo não estruturado e linguagem natural.
3. O Notinha deve continuar funcionando mesmo se um provedor de IA estiver indisponível.
4. Nenhuma nova funcionalidade desta camada pode gerar cobrança externa silenciosamente.
5. Alertas externos precisam ser habilitados explicitamente; o padrão é desligado.
6. Dados comunitários só aparecem de forma agregada e com limiar mínimo de privacidade.

## Estado anterior (CURRENT)

O Notinha já possuía:

- ingestão de notas fiscais por WhatsApp;
- OCR/extração por Gemini 2.5 Flash, com fallback para OpenAI e Claude;
- Google Drive e Google Sheets;
- resumo mensal;
- insights semanais;
- busca de lançamentos;
- maiores gastos;
- comparação de preço usando apenas o histórico do próprio cliente;
- tendências de produto;
- um insight AHA com comparação local ainda isolada;
- aprendizado de categorias;
- filas de webhook e processamento assíncrono.

## Decisões

### KEEP

- fluxo atual de ingestão WhatsApp;
- Google Drive/Sheets;
- estrutura de `clientes`, `notas_fiscais`, `itens` e `entradas`;
- RPCs existentes usados pelo menu;
- fila `webhook_events`;
- worker `processar-fila`;
- comportamento de fallback do comando de preço para histórico pessoal.

### MODIFY

- `comparar_preco_produto`: agora tenta Radar Comunitário primeiro quando existe massa suficiente e volta automaticamente ao histórico pessoal quando não existe;
- `whatsapp-webhook`: passou a aplicar allowlist de `phone_number_id` e pode validar `X-Hub-Signature-256` quando um App Secret reconhecido está configurado no ambiente.

### NEW

- `inteligencia_config`;
- `recorrencias_detectadas`;
- `inteligencia_insights`;
- `lembretes`;
- `inteligencia_comandos`;
- detecção de recorrências;
- anomalias de categoria;
- aumento de preço por EAN;
- despesa recorrente possivelmente atrasada;
- simulador `posso gastar?`;
- Radar Comunitário de preços;
- confirmação/ignorar/encerrar recorrências;
- feed estruturado de insights;
- API interna `inteligencia-v2`;
- refresh diário do motor;
- limpeza de comandos temporários.

### READY BUT OFF

- comandos novos de WhatsApp: feature flag `INTELLIGENCE_V2_COMMANDS_ENABLED=false`;
- comportamento proativo: `proativo_habilitado=false` por cliente;
- envio externo de lembretes: `envio_externo_habilitado=false` por padrão.

Isso permite manter a infraestrutura em produção sem enviar mensagens novas ou gerar custo externo antes da validação.

## Arquitetura

```text
WhatsApp / Site / NF
        |
        v
Dados normalizados
        |
        v
Supabase
        |
        v
Notinha Intelligence Engine v2
  - recorrências
  - anomalias
  - tendências
  - previsão de fluxo
  - preço comunitário
        |
        +--> insight estruturado
        +--> lembrete interno
        +--> API interna inteligencia-v2

IA generativa (opcional/futura)
        |
        +--> interpretar conteúdo não estruturado
        +--> converter insight estruturado em linguagem natural
```

## Detectores v2

### Recorrências

Agrupa gastos por CNPJ ou estabelecimento normalizado e exige no mínimo três ocorrências. Mede intervalo médio, estabilidade de valor e quantidade de observações. Classifica semanal, quinzenal, mensal, bimestral ou outro.

### Anomalia de categoria

Compara os últimos 30 dias com os 30 dias anteriores. Atualmente exige aumento mínimo de 30%, diferença absoluta mínima de R$ 50 e amostra mínima nos dois períodos.

### Recorrência atrasada

Quando uma recorrência de confiança suficiente deveria ter ocorrido recentemente e não aparece, gera um insight interno.

### Aumento de preço

Para produtos com EAN, compara a compra mais recente com a média histórica anterior. Atualmente exige aumento mínimo de 10% e R$ 1 de diferença.

## Radar Comunitário

O Radar Comunitário nunca retorna compra individual de outro cliente.

Regra padrão:

- mesmo município/UF disponível no cadastro derivado dos dados atuais;
- produto identificado preferencialmente por EAN;
- compras dos últimos 90 dias;
- pelo menos 3 OUTROS consumidores distintos por estabelecimento;
- resultados agregados por estabelecimento;
- se não houver densidade suficiente, o comando de preço mantém a comparação do histórico pessoal do cliente.

Observação: `clientes.cidade/uf` atualmente é derivado dos dados disponíveis no produto, podendo refletir a região de compra. Antes de apresentar isso como "perto da sua casa", deve existir uma definição explícita de localização do usuário.

## Posso gastar?

É uma estimativa de fluxo de caixa, não recomendação de investimento ou crédito.

Usa:

- entradas registradas no mês;
- gastos já registrados;
- recorrências futuras de confiança suficiente.

Retorna saldo projetado antes/depois e nível de confiança. Se não houver renda registrada, não cria falsa certeza.

## Alertas e lembretes

A tabela `lembretes` suporta canais `in_app`, `email` e `whatsapp`, porém:

- todo lembrete novo nasce com `envio_externo_habilitado=false`;
- `alertas_pendentes_v2` só libera itens quando o cliente também possui `proativo_habilitado=true`;
- portanto, a infraestrutura pode existir sem enviar mensagem e sem gerar custo Meta.

Uma recorrência confirmada pode criar um lembrete interno dois dias antes da data prevista. Ignorar ou encerrar a recorrência cancela esse lembrete.

## Custo de IA

O Intelligence Engine v2 não chama Gemini, OpenAI, Claude ou qualquer API de IA.

Risco residual no código legado de OCR:

- imagem: Gemini -> OpenAI -> Claude;
- PDF: Gemini -> Claude.

Logo, custo zero está garantido para a NOVA camada de inteligência, mas não pode ser afirmado para o OCR legado enquanto não for confirmado se existem chaves/billing de OpenAI/Anthropic no ambiente ou enquanto o fallback pago não for bloqueado por código.

Próxima alteração recomendada no OCR:

```text
AI_BUDGET_MODE=FREE_ONLY
```

Quando ativo, `extrairNF` deve usar somente provedores explicitamente classificados como gratuitos e falhar de forma controlada quando a franquia gratuita acabar, em vez de cair para um provedor potencialmente pago.

## Segurança

- novas tabelas com RLS;
- acesso somente por `service_role`;
- RPCs v2 revogados de `public`, `anon` e `authenticated`;
- API `inteligencia-v2` exige `x-worker-secret`;
- webhook aplica allowlist de `WHATSAPP_PHONE_NUMBER_ID`;
- webhook valida HMAC SHA-256 da Meta quando um App Secret reconhecido está disponível;
- nenhuma informação individual de outros clientes é retornada no Radar Comunitário.

## Automação

- `notinha-inteligencia-v2-diaria`: refresh diário, sem chamada externa de IA;
- `purga-inteligencia-comandos-v2`: remove comandos temporários com mais de 14 dias.

## Rollout recomendado

1. Motor determinístico em produção: CONCLUÍDO.
2. Radar Comunitário com fallback pessoal: CONCLUÍDO.
3. Segurança adicional do webhook: CONCLUÍDO.
4. API interna v2: CONCLUÍDO.
5. Feature flags e outbound desligados: CONCLUÍDO.
6. Smoke test com número real do WhatsApp: PENDENTE.
7. Bloquear explicitamente fallbacks potencialmente pagos no OCR: PENDENTE.
8. Habilitar comandos v2 apenas após smoke test.
9. Habilitar alertas externos somente depois de definir monetização, opt-in e custo Meta.

## Critério de sucesso da fase

O Notinha deve conseguir descobrir informação útil antes de o usuário perguntar, mas sem depender de IA generativa, sem expor dados individuais de outros clientes, sem enviar mensagens externas automaticamente e sem adicionar custo novo de API nesta fase.
