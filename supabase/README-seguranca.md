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

## Pronto na branch, aguardando deploy
| Alvo | Mudança |
|---|---|
| `oauth-callback` | state opaco, não sobrescreve código, entrega por `#t=` |
| `conectado.html` | aceita `#t=`, mantém fallback `?code=` |
| `processar-fila` | ATIVAR com rate limit, uso único, janela 30d, recusa genérica |
| `conta` | troca de telefone com código por crypto + libera uso único |
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
5. `processar-fila` pelo Dashboard (106 KB, não vai por MCP) + `conta`
6. `asaas-webhook`, `pixel`, `whatsapp-webhook`, `contato`

`onboarding` e `oauth-callback` são o mesmo passo lógico: separá-los quebra
cadastro novo. `conta` tem que sair junto com `processar-fila`, senão a troca
de número trava.

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

## Auditados (Fase E) — nenhuma alteração necessária
- `gerar-planilha-anual` v7 — `x-planilha-token` + premium + pagamento. OK.
- `enviar-boasvindas` v7 — `x-webhook-token`. Sem OAuth state. OK.
- `enviar-lista-espera` v1 — `x-webhook-token`. OK.
- `emails-recuperacao` v4 — `x-cron-token`. Auth OK, mas ver pendência acima.
