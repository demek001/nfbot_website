# Planilha Anual (premium) — plano técnico da Fase 1

> Status: **plano, não implementado**. Nada aqui foi deployado, migrado ou commitado
> além deste documento. O gerador Python (`scripts/build_planilha_notinha.py`) é a
> **especificação visual** — não vai para produção.

## 1. Escopo da Fase 1

Entregar, para clientes **premium**, uma planilha Google **por ano** que dá a visão
ampla do que hoje só existe mês a mês.

**Dentro:**
- Uma planilha por ano (`Notinha 2026`, `Notinha 2027`, …).
- Camada **anual apenas** — sem replicar os 12 tabs mensais (o plano base já entrega isso).
- Geração **sob demanda** (a pessoa pede no WhatsApp).
- Trava por `clientes.plano_tier = 'premium'`.
- Backfill: ao gerar, traz todas as notas do ano que já estão no banco.

**Fora (fases seguintes):**
- Atualização agendada/automática.
- Os 12 tabs mensais dentro da mestre.
- Melhoria da captura de `forma_pagamento` no worker (tratada em separado).

**Premissa que não muda:** o fluxo do plano base continua **exatamente como está**.
O worker `processar-fila` segue criando as planilhas mensais sem nenhuma alteração.
A planilha anual é uma função nova que lê o **Supabase** (fonte da verdade), não as
planilhas mensais.

## 2. Arquitetura

Molde: a edge function **`gerar-relatorio`** já faz 90% do encanamento necessário
(lê Supabase → autentica no Google → trabalha em background → avisa no WhatsApp).
A nova função copia essa estrutura e troca o miolo (PDF → Sheets API).

```
WhatsApp ("planilha do ano")
   └─► processar-fila
         ├─ checa plano_tier
         │    ├─ base    → mensagem de upsell, fim
         │    └─ premium ▼
         └─► POST /gerar-planilha-anual  (x-worker-secret, background)
               ├─ Supabase: notas + itens + entradas do ano
               ├─ agrega em TS (top produtos, variações de preço)
               ├─ Sheets API: cria ou atualiza a planilha
               ├─ Drive API: move para a pasta da Notinha
               ├─ planilhas_anuais: grava/atualiza sheet_id
               └─ WhatsApp: manda o link
```

### Por que não referenciar as abas mensais
A planilha anual **não lê** as planilhas mensais. Motivos: as mensais podem ter sido
editadas/apagadas pela pessoa, referências entre arquivos no Sheets (`IMPORTRANGE`)
exigem autorização manual e quebram fácil, e o banco já tem tudo. Fonte única: Supabase.

## 3. Estrutura da planilha

Chave do desenho: uma aba **`Lançamentos`** com as notas do ano, e todos os quadros
como **fórmulas sobre ela**. Assim a planilha continua viva (recalcula, filtra,
ordena) em vez de conter números chumbados.

| Aba | Conteúdo | Origem |
|---|---|---|
| `Como usar` | Instruções curtas | Fixo |
| `Visão Anual` | Resumo mês a mês (Entradas/Saídas/Saldo) + gráfico de barras + insights do ano | Fórmulas |
| `Categorias` | Categoria × 12 meses + total + gráfico de pizza | Fórmulas |
| `Produtos` | Top produtos mais comprados · Maiores variações de preço | Valores (agregado em TS) |
| `Lançamentos` | Uma linha por nota do ano: Data, Estabelecimento, Forma, Categoria, Valor | Escrita pela função |
| `Entradas` | Entradas do ano: Data, Descrição, Categoria, Valor | Escrita pela função |
| `Metas Financeiras` | Metas do usuário | **Preenchida pela pessoa** |
| `Investimento` | Reserva / Renda fixa por mês | **Preenchida pela pessoa** |

### Fórmulas-chave

Com `Lançamentos` tendo Data em `A`, Forma em `C`, Categoria em `D`, Valor em `E`:

```
# Saídas do mês N (Visão Anual)
=SUMIFS(Lançamentos!$E:$E; Lançamentos!$A:$A; ">="&DATE($A$1;N;1);
                            Lançamentos!$A:$A; "<="&EOMONTH(DATE($A$1;N;1);0))

# Entradas do mês N
=SUMIFS(Entradas!$D:$D; Entradas!$A:$A; ">="&DATE($A$1;N;1);
                         Entradas!$A:$A; "<="&EOMONTH(DATE($A$1;N;1);0))

# Categoria C no mês N (aba Categorias)
=SUMIFS(Lançamentos!$E:$E; Lançamentos!$D:$D; $A{linha};
        Lançamentos!$A:$A; ">="&DATE(...); Lançamentos!$A:$A; "<="&EOMONTH(...))
```

`$A$1` guarda o ano. Insights do ano (mês de maior gasto, categoria campeã, taxa de
poupança) seguem com `INDEX`/`MATCH`/`IFERROR`, como no protótipo.

### Regra de ouro do refresh
Regenerar **nunca pode apagar o que a pessoa escreveu**. Ao atualizar:

- **Reescreve:** `Lançamentos`, `Entradas`, `Produtos` (limpa o range e regrava).
- **Nunca toca:** `Metas Financeiras`, `Investimento`, e a coluna *Valor esperado* em `Categorias`.

Por isso o refresh é feito com `updateCells` em ranges específicos, e **não**
recriando a planilha.

## 4. Dados: as queries

Todas via PostgREST (`sbSelect`), como já se faz hoje.

```
# Notas do ano
notas_fiscais?cliente_id=eq.{id}
  &data_compra=gte.{ano}-01-01&data_compra=lt.{ano+1}-01-01
  &order=data_compra.asc,criado_em.asc
  &select=data_compra,estabelecimento,forma_pagamento,categoria,valor_total

# Entradas do ano
entradas?cliente_id=eq.{id}
  &data_entrada=gte.{ano}-01-01&data_entrada=lt.{ano+1}-01-01
  &select=data_entrada,descricao,categoria,valor

# Itens do ano (embed no FK itens.nf_id → notas_fiscais)
itens?select=descricao,quantidade,unidade,valor_unitario,valor_total_item,preco_base,
             notas_fiscais!inner(data_compra,cliente_id)
  &notas_fiscais.cliente_id=eq.{id}
  &notas_fiscais.data_compra=gte.{ano}-01-01
  &notas_fiscais.data_compra=lt.{ano+1}-01-01
```

**Sem migração de banco.** As agregações de `Produtos` são feitas em TS (o volume por
cliente/ano é de centenas a poucos milhares de linhas). Se um dia pesar, vira uma RPC.

### Agregações em TS

- **Top produtos:** normaliza `descricao` (trim, minúsculas, espaços colapsados),
  agrupa, conta ocorrências e soma `valor_total_item`; descarta ruído
  (`desconto sobre item`, `embalagem`, descrições com < 3 caracteres); ordena por
  frequência; top 10.
- **Variações de preço:** por produto normalizado, pega o preço unitário
  (`preco_base ?? valor_unitario`) da primeira e da última data; considera só quem
  aparece em ≥ 2 datas distintas; variação `(fim − início) / início`; ordena por
  variação desc; top 10. Positivo em vermelho, negativo em verde.

### Normalização (reuso + novo)

- **Categoria:** reusar `normalizarCategoria()` que já existe no worker. Mapear o
  legado que está no banco → enum atual: `Alimentacao`→Alimentação, `Padaria`→Alimentação,
  `Aluguel carro`→Transporte.
- **Forma de pagamento:** função nova `normalizarForma()` — `forma_pagamento` é texto
  livre da nota. Agrupar em 6: **Débito, Crédito, Pix, Dinheiro, Voucher, Outros**
  (regras validadas no protótipo Python: `credito|nubank`→Crédito;
  `ifood|voucher|alelo|stix|vale`→Voucher; `debito`→Débito; `pix`→Pix;
  `dinheiro`→Dinheiro; `mastercard|cartao|pos|tef`→Débito; nulo/resto→Outros).

> ⚠️ Hoje ~27% das notas chegam sem `forma_pagamento`, então "Outros" pesa. É fiel ao
> dado, mas limita o valor do quadro de formas de pagamento no produto pago.
> Tratar junto com o fluxo de confirmação no WhatsApp.

## 5. Persistência

Espelho de `planilhas_mensais`:

```sql
create table planilhas_anuais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  ano int not null,
  sheet_id text not null,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  unique (cliente_id, ano)
);
alter table planilhas_anuais enable row level security;
```

Lógica: busca por `(cliente_id, ano)` → existe? atualiza os ranges de dados.
Não existe? cria, move pro Drive, grava o `sheet_id`.

## 6. Sheets API — sequência de chamadas

**Criação** (`spreadsheets.create`): título `Notinha {ano}`, `properties.locale` e
`timeZone` definidos, e as 8 abas já declaradas.

**Formatação** (um `spreadsheets.batchUpdate` com os requests em lote):

| Objetivo | Request |
|---|---|
| Cor da aba, painel congelado | `updateSheetProperties` |
| Larguras de coluna | `updateDimensionProperties` |
| Fundos, fontes, formato R$/data/%, alinhamento | `repeatCell` |
| Títulos e faixas de destaque | `mergeCells` |
| **Pills coloridos** (categoria e forma) | `addConditionalFormatRule` (`TEXT_EQ`, uma regra por valor) |
| Dropdowns | `setDataValidation` (`ONE_OF_LIST`) |
| Pizza (categorias) e barras (mês a mês) | `addChart` |

**Valores e fórmulas:** `values.batchUpdate` com `valueInputOption: USER_ENTERED`
(necessário para as fórmulas serem interpretadas, não viradas em texto).

**Drive:** `files.update` com `addParents` para mover a planilha para a pasta da
Notinha da pessoa (`clientes.drive_folder_id` / tabela `pastas_drive`).

### ⚠️ Gotcha para testar logo no primeiro dia
Com `USER_ENTERED`, o Sheets interpreta a fórmula segundo o **locale da planilha**.
Em `pt_BR` o separador de argumentos é `;` — em `en_US` é `,`. Escrever com o
separador errado gera `#ERROR!` em massa. **Fixar o locale na criação e validar com
duas ou três fórmulas antes de gerar a grade inteira.** (Este documento usa `;`
assumindo `pt_BR`.)

## 7. Gate premium e comando

**Gatilho:** intenção no WhatsApp — "planilha do ano", "resumo do ano", "planilha
anual", "visão anual" — e/ou item no menu. Segue o padrão de detecção que
`processar-fila` já usa para os outros comandos.

**Premium:**
> 📊 Beleza! Tô montando sua planilha de {ano} com tudo que você já mandou.
> Te aviso aqui quando ficar pronta (leva uns instantes).

**Base (upsell honesto, sem pressão):**
> 📊 A *planilha anual* é do plano Premium — ela junta o ano inteiro num lugar só,
> com os produtos que você mais compra e quanto cada um subiu de preço.
> Suas planilhas mensais continuam normalmente. Quer saber mais?

**Pronto:**
> ✅ Sua planilha de {ano} tá pronta: {link}
> {n} notas · total {R$ X}. É só pedir "planilha do ano" quando quiser atualizar.

**Sem dados:**
> Ainda não tenho notas de {ano} pra montar a planilha. Manda umas notas primeiro. 🙂

**Upgrade → backfill:** quando `plano_tier` vira `premium` (webhook do Asaas), disparar
a geração do ano corrente automaticamente, para a pessoa já encontrar valor no primeiro
minuto.

**Downgrade:** para de atualizar; a planilha existente **não** é apagada (o arquivo é
do Drive da pessoa). Deixar explícito no "Como usar".

## 8. Contrato da função

```
POST /functions/v1/gerar-planilha-anual
Header: x-worker-secret: {WORKER_SECRET}
Body:   { cliente_id, phone_number_id, to, ano? }   # ano default = ano corrente
→ 202 { ok: true, modo: "background" }
```

Roda em `EdgeRuntime.waitUntil` (igual `gerar-relatorio`) para não estourar o tempo
do webhook. Falhas: log no console + mensagem amigável no WhatsApp, nunca silêncio.

## 9. Ordem de implementação

1. Tabela `planilhas_anuais` (migração).
2. Esqueleto da função: clona `gerar-relatorio`, valida secret e payload, checa
   `plano_tier`, busca as notas, responde 202.
3. **Spike do locale/fórmula** — criar planilha, escrever 3 fórmulas, conferir. Antes de tudo.
4. `Lançamentos` + `Entradas` (dados crus escritos corretamente).
5. `Visão Anual` + `Categorias` (fórmulas + gráficos).
6. `Produtos` (agregação em TS).
7. Formatação: pills, cores, larguras, congelamento.
8. `Metas`, `Investimento`, `Como usar`.
9. Fluxo do WhatsApp: comando, gate, mensagens.
10. Refresh: reescrever só os ranges de dados, preservando o que é do usuário.
11. Drive: mover para a pasta certa.
12. Backfill no upgrade.

Passos 1–4 já dão uma planilha utilizável ponta a ponta — bom ponto de corte para
testar com conta real antes de investir no resto.

## 10. Testes

- Conta **premium** com volume real de notas → confere totais contra o SQL.
- Conta **base** → recebe o upsell, nenhuma planilha é criada.
- Conta **sem notas no ano** → mensagem amigável, nada criado.
- **Gerar duas vezes** → não duplica planilha, e **não apaga** Metas/Investimento
  preenchidos entre as duas execuções (o teste mais importante).
- Ano virado (1º de janeiro) → cria a planilha do ano novo, não mexe na anterior.
- Cliente **sem Google conectado** → mensagem clara, sem erro cru.

### Como validar os números
O protótipo Python já foi conferido contra o banco. Para validar a implementação em
produção, rode o gerador local com os dados de uma conta de teste e compare, mês a
mês: total de saídas, categoria campeã, nº de lançamentos, ticket médio, maior compra
e saldo. Os valores têm que bater exatamente com a query SQL equivalente.

> Dados reais de cliente (valores, estabelecimentos, totais) **não entram neste
> repositório** — ele é público. Use conta de teste ou mantenha os números fora do git.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Separador de fórmula por locale | Spike no passo 3, antes de qualquer grade |
| Refresh apagar dados do usuário | Ranges cirúrgicos; teste dedicado |
| `forma_pagamento` nulo (~27%) | Fluxo de confirmação no WhatsApp; até lá, "Outros" honesto |
| Categorias legadas fora do enum | `normalizarCategoria()` na leitura (não precisa mexer no histórico) |
| Timeout em conta com muitas notas | Background via `waitUntil`; lotes no `batchUpdate` |
| Cota da Sheets API | Sob demanda já limita naturalmente; monitorar na Fase 2 |
