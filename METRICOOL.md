# Metricool

Todas as 42 páginas HTML carregam `/scripts/metricool.js` uma vez, com `defer`.
O loader central carrega o script oficial por HTTPS e envia no máximo uma visita
por documento, usando o hash `2ad3966fcc4ad132dd87a95f5b5c37dd`.

## Privacidade e limites

- Só funciona no domínio de produção, após `cookieConsent=all`. A escolha
  “Somente essenciais”, ausência de escolha ou armazenamento indisponível não
  inicia o Metricool. Páginas sem banner dependem de consentimento anterior.
- O script oficial envia a URL inteira e o referrer. Por isso esta integração
  não mede conta, ativação, painel ou confirmação de pagamento. Também não mede
  visitas com query string (inclusive UTM) ou fragmento desconhecido, nem visitas
  cujo referrer contenha query string, fragmento ou uma dessas áreas privadas.
  Isso reduz a cobertura, mas evita enviar tokens e identificadores ao fornecedor.
- Uma âncora que corresponde a um elemento da página (por exemplo `#planos`)
  pode ser medida. Nenhuma URL é reescrita e nenhum fluxo de login é alterado.
- Falhas do fornecedor não interrompem a página. Ambientes locais e previews
  não enviam visitas. Não há tentativas automáticas repetidas após erro de rede.
- Segundo o Metricool, seu tracker não usa cookies, mas processa a conexão/IP
  e a página visitada. Aqui ele segue o opt-in analítico existente do site.

## Novas páginas e testes

Execute `node scripts/install-metricool.cjs` após criar HTMLs, inclusive posts
agendados. O comando é idempotente. A validação no GitHub detecta páginas sem tag.

```
node scripts/install-metricool.cjs --check
node --test scripts/metricool.test.cjs
```

## Confirmar depois do merge e da publicação

1. Na marca Notinha no Metricool, abra Conexões > Conectar site > JavaScript.
2. Confirme o hash acima e clique em Verificar conexão.
3. Abra `https://usenotinha.com.br/` sem parâmetros em uma janela sem bloqueador,
   aceite os cookies e visite `/blog/`. Não use URLs de preview para esta etapa.
4. Em Network do navegador, confira uma carga de `be.js` e uma chamada
   `c3po.jpg` com o hash correto por página; não deve haver duas chamadas por visita.
5. Confira visitas em tempo real no Metricool. Analytics pode levar 24 horas.
6. Em outra janela limpa, escolha Somente essenciais e confirme que nenhuma
   requisição ao tracker é enviada. Confira também um link privado de painel.

Guia oficial: https://help.metricool.com/how-to-connect-your-website-or-blog-to-metricool-ejuy1
