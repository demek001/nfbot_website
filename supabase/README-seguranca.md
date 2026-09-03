# Correções de segurança — estado da execução

Baseline (§3) rodada antes e depois da Fase A: **idêntica** — 4 clientes ativos,
Drive conectado, 147 / 68 / 36 / 11 notas.

## Aplicado no banco (Fase A completa)
- `oauth_states`, `ativacao_tokens`, `ativacao_tentativas`, `signup_tentativas`
- `clientes.codigo_gerado_em`, `clientes.codigo_usado_em`
- Backfill: `codigo_usado_em` preenchido nos 4 ativos; `codigo_gerado_em` em 2 não ativados
- `ativacao_rate_hit()`, `signup_rate_hit()`, `purgar_webhook_events_desconhecidos()`
- Cron `purga-webhook-desconhecidos` às 03:20 UTC

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
- **Secret `TURNSTILE_SECRET`** ainda não criada. Sem ela, `onboarding` e
  `contato` logam falha e deixam passar (modo permissivo). Depois de criada e
  validada nos logs, setar `TURNSTILE_MODO=estrito`.
- **`emails-recuperacao` v4** monta `state: clienteId` em `linkOauthDrive` (e-mail R3).
  Depois do passo 4, esse link vira `erro=link`. Só afeta cliente pagante ativado
  sem Drive — hoje, ninguém. Corrigir antes do primeiro cliente nessa situação.
- **C.5** (dropar policy `mensagens_contato_insert_only` e revogar INSERT de `anon`)
  só depois do passo 6 testado.
- **D.1**: `zoho-token-setup`, `zoho-token-helper`, `teste-bv` sem nenhuma referência
  no repo — liberadas para deleção quando você autorizar.
- **D.2**: `ASAAS_BASE_URL` — o default no código de `onboarding` é sandbox.
  Conferir se a secret existe em produção.
- **D.3**: `oferta-51e6138a.html` e `cadastro-a7f3#9.html` continuam no repo.
  `cadastro-a7f3#9.html` também chama `onboarding` e vai bater no CORS travado.
- **§5.1**: reenvio do convite da Denise, quando você confirmar.

## Auditados (Fase E) — nenhuma alteração necessária
- `gerar-planilha-anual` v7 — `x-planilha-token` + premium + pagamento. OK.
- `enviar-boasvindas` v7 — `x-webhook-token`. Sem OAuth state. OK.
- `enviar-lista-espera` v1 — `x-webhook-token`. OK.
- `emails-recuperacao` v4 — `x-cron-token`. Auth OK, mas ver pendência acima.
