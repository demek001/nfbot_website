# Correções de segurança — estado da execução

Baseline (§3) rodada antes e depois da Fase A: **idêntica** — 4 clientes ativos,
Drive conectado, 147 / 68 / 36 / 11 notas.

## Aplicado no banco (Fase A completa)
- `oauth_states`, `ativacao_tokens`, `ativacao_tentativas`, `signup_tentativas`
- `clientes.codigo_gerado_em`, `clientes.codigo_usado_em`
- Backfill: `codigo_usado_em` preenchido nos 4 ativos; `codigo_gerado_em` em 2 não ativados
- `ativacao_rate_hit()`, `signup_rate_hit()`, `purgar_webhook_events_desconhecidos()`
- Cron `purga-webhook-desconhecidos` às 03:20 UTC

## Fase A2 — aplicada (fecha o que a Fase A abriu)
- `ativacao_tentativas` e `signup_tentativas` nasceram sem RLS na Fase A. Corrigido:
  RLS ligado, sem policy, e `revoke all` de `anon`/`authenticated`.
- `ativacao_rate_hit`, `signup_rate_hit`, `painel_rate_hit` e
  `purgar_webhook_events_desconhecidos` tinham EXECUTE herdado de `PUBLIC`.
  Revogado de `PUBLIC`; `service_role` mantido por grant explícito.
- Conferido: nenhuma tabela do schema `public` está sem RLS.
- Baseline do §3 rodada depois: idêntica.

**Regra do protocolo, daqui em diante:** toda tabela nova em `public` nasce com
`enable row level security` na mesma migration; toda função `security definer`
nasce com `revoke execute ... from public` e `grant execute ... to service_role`.

### F3 — resolvido junto com o D.3
A spec dizia que o formulário da lista de espera tinha saído. Não tinha:
`oferta-51e6138a.html` ainda fazia `POST /rest/v1/leads_interesse` com a chave anon.
Por decisão do Yoseff, a página foi removida do repo (junto com `cadastro-a7f3#9.html`),
a policy `leads_interesse_insert_only` foi dropada e o INSERT revogado de
`anon`/`authenticated`. Conferido: 0 policies, `anon` sem INSERT.

## Deployado
- `codigo-ativacao` v1 (`verify_jwt = false`) — função nova, não afeta fluxo existente
- `conta` v15 → **v16** (`verify_jwt = true`) — 04/09/2026
  `ezbr_sha256` `eea149a7a60e747a8156d2743836d9d8f25b5e75d93fad40e46c9db3caac76d4`
  → `d99f83625f5fbe56cb65ec294be16ae4ac2b51b0122446010f8d3d94952f7672`
- `processar-fila` v44 → **v45** (`verify_jwt = false`) — 04/09/2026
  `ezbr_sha256` `04e48b365d180f7871d313f7dc967e2090f3a19e0d1a0a8f3648468bfa785109`
  → `2d4a0b6c14b98aab8737915877cdef4f3d6abe22d409bd513e06ba408f619e9b`

Testado em produção depois do deploy: nota processada normalmente e gravada na
planilha; `ATIVAR` com código inexistente devolve a mensagem única; rate limit
corta a partir da 6ª tentativa na hora, com as tentativas registradas em
`ativacao_tentativas`. A regra do número já vinculado a outro cliente fica
verificada pelo diff — testá-la em produção exigiria o código de um cadastro
real. Troca de telefone ponta a ponta ainda não exercitada.

## Pronto na branch, aguardando deploy
| Alvo | Mudança |
|---|---|
| `oauth-callback` | state opaco, não sobrescreve código, entrega por `#t=` |
| `conectado.html` | aceita `#t=`, mantém fallback `?code=` |
| `convite-cortesia`, `onboarding` | state opaco em `oauth_states` |
| `asaas-webhook` | código por `crypto.getRandomValues` |
| `pixel` | `?r=wa` sem `?text=` |
| `whatsapp-webhook` | "📸 Recebi!" só para número ativado |
| `onboarding` | Turnstile (modo permissivo), rate limit por IP, CORS travado |
| `assinar/index.html`, `contato/index.html` | widget Turnstile |
| `contato` (função nova) | grava `mensagens_contato` com service role |

### Ordem obrigatória do deploy
1. `codigo-ativacao` ✅ feito
2. Merge da branch em `main` (publica `conectado.html` com os dois formatos)
3. `onboarding` + `convite-cortesia` — passam a gravar `oauth_states`
4. `oauth-callback` — passa a exigir `oauth_states`
5. `conta` por MCP (`verify_jwt: true`), **depois** `processar-fila` pelo
   Dashboard (106 KB, não vai por MCP) ✅ feito
6. `asaas-webhook`, `pixel`, `whatsapp-webhook`, `contato`

`onboarding` e `oauth-callback` são o mesmo passo lógico: separá-los quebra
cadastro novo. `conta` tem que sair junto com `processar-fila`, senão a troca
de número trava — e nesta ordem, `conta` primeiro. O `conta` novo grava
`codigo_usado_em: null`, campo que o `processar-fila` v44 nem lê, então a janela
entre os dois é inofensiva. Na ordem inversa trava: o `conta` v15 não zera
`codigo_usado_em`, e os 4 ativos têm o campo preenchido desde o backfill da
Fase A — o `tentarAtivar` novo recusaria a troca legítima.

## Pendências
- **Turnstile**: `TURNSTILE_SECRET` criada no Supabase. Widget "Notinha — formulários
  públicos", sitekey `0x4AAAAAAEmLqsLsblMemLoi`, já aplicada em `assinar/index.html`
  e `contato/index.html`. A `conta.html` segue com `0x4AAAAAADg8XhQoJhpFcb5w`, que
  pertence ao widget do Supabase Auth — não mexer. `TURNSTILE_MODO` sem valor
  (permissivo) até os logs confirmarem que os tokens chegam; depois `estrito`.
- **`emails-recuperacao` v4** monta `state: clienteId` em `linkOauthDrive` (e-mail R3).
  Depois do passo 4, esse link vira `erro=link`. Só afeta cliente pagante ativado
  sem Drive — hoje, ninguém. Corrigir antes do primeiro cliente nessa situação.
- **C.5** (dropar policy `mensagens_contato_insert_only` e revogar INSERT de `anon`)
  só depois do passo 6 testado.
- **D.3**: feito — as duas páginas órfãs saíram do repo.
- **D.1**: `zoho-token-setup`, `zoho-token-helper`, `teste-bv` sem nenhuma referência
  no repo — liberadas para deleção quando você autorizar.
- **D.2**: `ASAAS_BASE_URL` — o default no código de `onboarding` é sandbox.
  Conferir se a secret existe em produção.
- **§5.1**: reenvio do convite da Denise, quando você confirmar.
- **`codigo_gerado_em` null**: o `tentarAtivar` v45 aceita código com
  `codigo_gerado_em` null — a janela de 30 dias só vale quando o campo está
  preenchido. Ficou assim de propósito: o `garantirCodigo` do `asaas-webhook`
  v14 grava só `codigo_ativacao`, então recusar null travaria o primeiro cliente
  pagante. Passar a recusar null junto com o deploy do `asaas-webhook` (passo 6),
  que já grava `codigo_gerado_em`.

## Auditados (Fase E) — nenhuma alteração necessária
- `gerar-planilha-anual` v7 — `x-planilha-token` + premium + pagamento. OK.
- `enviar-boasvindas` v7 — `x-webhook-token`. Sem OAuth state. OK.
- `enviar-lista-espera` v1 — `x-webhook-token`. OK.
- `emails-recuperacao` v4 — `x-cron-token`. Auth OK, mas ver pendência acima.
