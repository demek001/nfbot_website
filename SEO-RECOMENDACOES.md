# Notinha — Plano de crescimento orgânico (SEO)

Este documento complementa as correções técnicas já aplicadas no código do site.
Aqui estão as ações que **não são código** — dependem de rotina, conta no Google
ou decisões de produto.

## O que já foi corrigido no código (julho/2026)

- Sitemap completo (antes só tinha a homepage; agora inclui blog, post e contato)
- Imagem do blog convertida para WebP real (1,39 MB → 68 KB) — melhora direta no Core Web Vitals
- `og:image` + Twitter Cards em todas as páginas indexáveis (preview correto ao compartilhar no WhatsApp)
- Dados estruturados: `Organization`, `WebSite` e `FAQPage` na home; `BreadcrumbList` no post
- Links quebrados `#planos` corrigidos; links internos normalizados para `/` (elimina URL duplicada)
- Fonts com `preconnect`; logo do header otimizada (178 KB → 20 KB); poster no vídeo demo
- Inputs com 16px (sem zoom automático no iOS); header responsivo em telas pequenas; página 404

## 1. Google Search Console (fazer primeiro — 30 min)

1. Verifique a propriedade `usenotinha.com.br` em https://search.google.com/search-console
   (verificação por DNS é a mais simples para domínio no GitHub Pages).
2. Envie o sitemap: `https://usenotinha.com.br/sitemap.xml`.
3. Use "Inspeção de URL" para pedir indexação da home, do `/blog/` e do post da planilha.
4. Acompanhe semanalmente: **Cobertura** (páginas indexadas) e **Desempenho**
   (quais consultas já trazem impressões — é dali que saem as ideias de novos posts).

## 2. Conteúdo — a maior alavanca

O site tem 1 post. Sites novos ranqueiam pelo conteúdo de cauda longa, não pela home.
O post da planilha está bem construído (FAQ schema, download grátis como ímã de link) —
o caminho é repetir essa fórmula.

**Sugestão de calendário (1 post a cada 2 semanas):**

| Post | Palavra-chave alvo | Intenção |
|---|---|---|
| Como organizar notas fiscais (pessoais e MEI) | "como organizar notas fiscais" | quem já guarda notas — público perfeito |
| Controle de gastos pelo WhatsApp: como funciona | "controle de gastos whatsapp" | busca direta pelo produto |
| Quanto tempo guardar cupom fiscal e nota fiscal? | "quanto tempo guardar nota fiscal" | dúvida frequente, pouco concorrida |
| Planilha ou app de finanças: qual funciona de verdade? | "planilha ou app de finanças" | comparação — espelho da seção "Por que" da home |
| Como declarar despesas no imposto de renda com notas fiscais | "guardar nota fiscal imposto de renda" | sazonal (jan–abr), tráfego alto |
| NFC-e, NF-e e cupom fiscal: qual a diferença? | "diferença nfc-e nfe cupom fiscal" | informacional, atrai o público certo |

**Regras que valem por todo post:**
- Título com a palavra-chave no início; URL curta (`/blog/como-organizar-notas-fiscais/`).
- Interligar: todo post novo linka para 1–2 posts antigos e para a home; atualizar posts antigos com link para o novo.
- Adicionar cada post novo ao `sitemap.xml` e ao índice `/blog/`.
- Reaproveitar o padrão do post existente: FAQ no final + schema `FAQPage` + CTA para a lista.

## 3. Backlinks e divulgação

- **A planilha grátis é seu ativo de links**: divulgue o post em comunidades de finanças
  pessoais (grupos de Facebook, Reddit r/investimentos e r/financaspessoais, fóruns de MEI).
  Um recurso gratuito sem cadastro é o tipo de coisa que blogs e newsletters citam.
- Cadastre o Notinha em diretórios de startups/SaaS brasileiros (ex.: Startupbase, Product Hunt no lançamento).
- Quando o produto abrir, peça avaliações no Google (perfil Google Business, se fizer sentido para o CNPJ).

## 4. Ajustes de produto/compliance para fazer depois

- **Google Consent Mode**: hoje o `gtag.js` carrega antes do usuário aceitar o banner de
  cookies. O ideal (LGPD) é iniciar com `gtag('consent', 'default', {analytics_storage: 'denied'})`
  e liberar via `gtag('consent', 'update', ...)` quando o usuário clicar "Aceitar todos".
- **`cadastro-a7f3#9.html`**: o `#` no nome do arquivo faz o navegador tratar `#9.html`
  como fragmento — a URL real fica inacessível por link direto. Recomendo renomear
  (ex.: `cadastro-a7f39.html`) e atualizar qualquer lugar que aponte para ela (e-mails, bot).
  Não foi alterado no código para não quebrar links já enviados.
- Quando os planos forem lançados, criar a seção `#planos` na home com schema
  `Product`/`Offer` — os CTAs do blog hoje apontam para `#lista` (lista de espera).

## 5. Métricas para acompanhar (mensal)

- Search Console: impressões, cliques e posição média por consulta.
- PageSpeed Insights (https://pagespeed.web.dev) para a home e o post — meta: LCP < 2,5 s no mobile.
- Cadastros da lista de espera por origem (o campo `referrer` já é salvo no Supabase).
